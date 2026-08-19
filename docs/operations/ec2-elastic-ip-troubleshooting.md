# EC2 Public IP (Elastic IP) Reachability — Troubleshooting Log

**Status:** UNRESOLVED — IPv4 inbound to the Elastic IP times out from outside, while the instance is healthy and all AWS-side config checks out.
**Date:** 2026-08-17
**Intended audience:** Anyone (human or AI/agent, e.g. AWS MCP) continuing this investigation.

---

## 1. Executive Summary

The LMS backend stack runs on an EC2 instance in `eu-north-1` (Stockholm). The instance itself is healthy: all Docker services are up, Caddy listens on port 80, SSH is open, and the app responds `200` **locally** on the server. A **public Elastic IP (EIP)** was allocated and associated so Vercel-hosted frontends (and the operator) can reach the backend APIs.

**The problem:** inbound **IPv4** traffic to the Elastic IP times out from the operator's network (SSH port 22, HTTP port 80, ICMP ping — all time out). The instance is running, the EIP is associated to the correct instance, the security group allows SSH/HTTP from `0.0.0.0/0`, and the network ACL allows all traffic. Yet no IPv4 packets get through.

**Critical twist discovered:** connecting via the **public DNS hostname** (`ec2-13-50-176-4.eu-north-1.compute.amazonaws.com`) **works** — but only over **IPv6/NAT64**. Forcing IPv4 (`curl -4`, `ssh -4`) to the same hostname times out. This isolates the fault to **IPv4 routing/reachability for the EIP**, not the instance, security group, NACL, or application.

---

## 2. Environment & Context

| Item | Value |
|---|---|
| Region | `eu-north-1` (Stockholm) |
| Instance ID | `i-0368e0157637daca9` (name: **LMS Server**) |
| Instance type | `c7i-flex.large` |
| Private IPv4 | `172.31.3.133` |
| Private hostname | `ip-172-31-3-133.eu-north-1.compute.internal` |
| Elastic IP | `13.50.176.4` |
| Public DNS (EIP) | `ec2-13-50-176-4.eu-north-1.compute.amazonaws.com` |
| Security group | `launch-wizard-1` |
| VPC ID | `vpc-0f51b7c31ef3610c6` |
| Subnet ID | `subnet-0849f99c3d4f8aab8` |
| Network interface | `eni-0935aa2a479592e8d` |
| IAM role | None (no instance profile) |
| IMDSv2 | Required (token needed for metadata) |
| Account ID | `972472392485` |

**Previous state:** The instance previously had an auto-assigned public IP `16.192.155.151`. Operator could reach it (SSH worked via `ec2-16-192-155-151.eu-north-1.compute.amazonaws.com`). After associating the Elastic IP `13.50.176.4`, the old public IP was **released** (expected AWS behavior), and the old hostname no longer resolves to a live IPv4.

---

## 3. What Has Been Verified (and How)

### 3.1 Instance state — CONFIRMED OK
- Instance state: **Running** (console + instance summary).
- Status checks: reported healthy at time of last SSH access.
- Confirmed the private IP `172.31.3.133` matches the host we SSH into.

### 3.2 Elastic IP association — CONFIRMED OK
From the AWS console (Elastic IPs → `13.50.176.4`):
- **Associated instance ID:** `i-0368e0157637daca9 (LMS Server)` ✅
- **Associated network interface:** `eni-0935aa2a479592e8d` ✅
- Type: Public IP ✅
- The instance summary shows `13.50.176.4` as its Public IPv4 address.

### 3.3 Security group — CONFIRMED OK
- Security group: `launch-wizard-1`.
- AWS console shows a warning banner: **"Port 22 (SSH) is open to all IPv4 addresses"** (`0.0.0.0/0` inbound rule present).
- HTTP (80) was verified as an inbound rule intent; the app listens on `0.0.0.0:80` and `0.0.0.0:22` (confirmed via `ss -tlnp` on the server).

### 3.4 Network ACL — CONFIRMED OK
- NACL has exactly two rules on **both** Inbound and Outbound tabs:
  - Rule `100`: All traffic, All, All, `0.0.0.0/0`, **Allow**
  - Rule `*`: All traffic, All, All, `0.0.0.0/0`, **Deny** (default catch-all)
- Because NACL rules are evaluated lowest-number-first and the first match wins, rule `100` (Allow all) matches everything → effectively Allow-All. **The NACL is NOT blocking.**

### 3.5 Server-side — CONFIRMED OK
Ran on the instance (via SSH over the IPv6/NAT64 path):
- `ss -tlnp`: `0.0.0.0:22` and `0.0.0.0:80` listening (both IPv4 + IPv6). ✅
- `curl http://localhost/api/v1/health` → **200** ✅
- `curl http://localhost/api/health` (portal BFF) → **200** ✅
- `ip route`: `default via 172.31.0.1 dev enp39s0 ... src 172.31.3.133` — normal VPC default route via the gateway. ✅
- `iptables` INPUT policy: ACCEPT; `ufw`: inactive. ✅
- Docker containers all healthy: `lims_backend`, `lims_database`, `lims_caddy`, `lims_cloudflared`, `portal_backend`, `portal_redis`, `ai_service`. ✅

### 3.6 Reachability from the operator's network — FAILING
All from the operator's Windows machine (source IP observed on server: `95.184.112.197`):

| Test | Result |
|---|---|
| `ssh -i SSH-KEY.pem ubuntu@13.50.176.4` | **Connection timed out** (port 22) |
| `ssh -4 ubuntu@13.50.176.4` | **Connection timed out** |
| `curl http://13.50.176.4/api/v1/health` | **Connection timed out** (port 80) |
| `curl -4 http://ec2-13-50-176-4.../api/v1/health` | **Connection timed out** |
| `ping 13.50.176.4` | **100% packet loss** |
| Raw TCP connect to `13.50.176.4:22` / `:80` / `:443` | **All TIMEOUT** |
| `ssh ubuntu@ec2-13-50-176-4.eu-north-1.compute.amazonaws.com` (no `-4`) | ✅ **WORKS** (over IPv6/NAT64) |
| `nslookup ec2-13-50-176-4.eu-north-1.compute.amazonaws.com` | Resolves to **IPv6 only** from operator's DNS: `64:ff9b::d32:b004` (NAT64 of `13.50.176.4`) |

**Interpretation:** The DNS name itself resolves to IPv6 via the operator's resolver; SSH connected over that IPv6/NAT64 path. **IPv4 packets to `13.50.176.4` never arrive.** This is the crux.

---

## 4. Hypotheses (ranked)

1. **EIP IPv4 not globally routable yet / regional propagation issue.**
   A freshly allocated EIP can take time to propagate, or the EIP may be in a broken state. **Test:** release and re-allocate a fresh EIP, associate to the same instance, retest.

2. **Operator's network / ISP blocking the specific IP range.**
   IPv6/NAT64 works from the same machine, so the operator's network can reach AWS — just not IPv4 to this address. **Test:** access from a different network (phone on cellular, VPN, another machine). If it works elsewhere, the EIP is fine and the fault is local.

3. **VPC route table missing `0.0.0.0/0 → Internet Gateway` on the subnet.**
   Would break all inbound AND outbound IPv4 internet traffic. BUT: the instance previously had a working public IP and currently reaches the internet over IPv4 internally... **Partial counter-evidence** — outbound IPv4 appears to work (the server resolves/curl's external endpoints). **Action:** verify the route table for `subnet-0849f99c3d4f8aab8` has `0.0.0.0/0` → `igw-*` (not a NAT gateway).

4. **EIP associated to a different instance than the Docker host.**
   **Disproven** — the console shows association to `i-0368e0157637daca9`, whose private IP matches the server we can SSH into.

5. **Instance stopped.**
   **Disproven** — state is Running, and SSH over IPv6 works.

6. **AWS-side capacity/health issue on the EIP (rare).**
   AWS may be having a routing issue for this specific address. Re-allocation (hypothesis 1) would resolve.

---

## 5. Everything Already Tried

1. SSH to the EIP directly → timeout.
2. SSH to the EIP forcing IPv4 → timeout.
3. SSH to the old public DNS hostname (`ec2-16-192-155-151...`) → timeout (old IP released).
4. SSH to the **new** public DNS hostname (`ec2-13-50-176-4...`) → **works** (via IPv6/NAT64).
5. curl (IPv4) to the EIP on port 80 → timeout.
6. curl (IPv4) to the new hostname on port 80 → timeout.
7. ping / raw TCP connect to EIP ports 22, 80, 443 → all timeout.
8. Verified instance state, EIP association, security group inbound rules, NACL rules, server listeners, server firewall, default route — all correct.
9. `nslookup` of the new hostname → resolves to IPv6 only from the operator's resolver.
10. Vercel frontends deployed (framework preset issue fixed via `vercel.json`); the `/api/*` rewrites target `http://13.50.176.4` and will fail until IPv4 opens.

---

## 6. Next Steps (recommended, in order)

1. **Test from a different network** (cellular/VPN/other machine): `curl -4 http://13.50.176.4/api/v1/health` and `ssh -4 ubuntu@13.50.176.4`.
   - If it works → the EIP is fine globally; the operator's network/ISP is the problem. No AWS change needed.
2. **Verify the route table** for `subnet-0849f99c3d4f8aab8` has `0.0.0.0/0 → igw-*` (Internet Gateway), not a NAT gateway or missing route.
3. **Release and re-allocate the EIP** in `eu-north-1`, associate it to `i-0368e0157637daca9`, and retest IPv4.
   - If the new EIP works → done; update the frontend rewrite origins + docs from `13.50.176.4` to the new IP (one-line change in `apps/erp/frontend/next.config.js`, `apps/portal/frontend/next.config.js`, `apps/erp/frontend/lib/api.ts`, `apps/portal/frontend/lib/api.ts`, and env vars on Vercel).
4. If all the above fail, **open a support case with AWS** (EC2 → Support) referencing: account `972472392485`, instance `i-0368e0157637daca9`, EIP `13.50.176.4`, symptom "IPv4 unreachable while IPv6/NAT64 works; SG/NACL/route checks pass."

---

## 7. Useful Commands for the Next Investigator

```bash
# From the operator machine (Windows cmd/PowerShell)
ssh -i SSH-KEY.pem -o StrictHostKeyChecking=no ubuntu@13.50.176.4          # IPv4 — expected: timeout
ssh -i SSH-KEY.pem -o StrictHostKeyChecking=no ubuntu@ec2-13-50-176-4.eu-north-1.compute.amazonaws.com   # IPv6/NAT64 — expected: works
curl -4 -m 8 http://13.50.176.4/api/v1/health                              # expected: timeout
nslookup ec2-13-50-176-4.eu-north-1.compute.amazonaws.com                   # shows IPv6-only resolution

# From the server (via the working SSH path)
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost/api/v1/health    # expected: 200
ss -tlnp | grep -E ':80|:22'                                                # listeners
ip route | grep default                                                     # default route via 172.31.0.1
iptables -L INPUT -n; ufw status                                            # host firewall (both permissive)

# AWS CLI (needs valid credentials — the operator's stored keys were expired)
aws ec2 describe-instances --region eu-north-1 --instance-ids i-0368e0157637daca9 \
  --query 'Reservations[].Instances[].{State:State.Name,PubIp:PublicIpAddress,PrivIp:PrivateIpAddress}'
aws ec2 describe-route-tables --region eu-north-1 --filters Name=association.subnet-id,Values=subnet-0849f99c3d4f8aab8
aws ec2 describe-security-groups --region eu-north-1 --group-names launch-wizard-1
aws ec2 describe-network-acls --region eu-north-1 --filters Name=association.subnet-id,Values=subnet-0849f99c3d4f8aab8
aws ec2 describe-addresses --region eu-north-1 --public-ips 13.50.176.4
```

---

## 8. Related Context (if this becomes a deployment doc)

- Frontends now deploy to **Vercel** (ERP: `apps/erp/frontend/` → root dir, Portal: `apps/portal/frontend/` → root dir). Both rewrite `/api/*` to `http://13.50.176.4` in `next.config.js`.
- EC2 runs only the backend stack (no frontend containers): `lims_backend` :8000, `portal_backend` :8001, `lims_database`, `lims_caddy` (API gateway on :80), `lims_cloudflared` (tunnel), `portal_redis`, `ai_service`.
- The app is fully functional when reached locally or over the IPv6 path; only inbound IPv4 to the EIP is broken.
- Once IPv4 is restored, final verification: `curl http://13.50.176.4/api/v1/health` → `200` from anywhere, then test the live Vercel frontends end-to-end.
