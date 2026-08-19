"use client";

import React from "react";
import { useAuth } from "@/components/AuthContext";
import TeacherDashboard from "@/components/dashboard/TeacherDashboard";
import SecretaryDashboard from "@/components/dashboard/SecretaryDashboard";
import ManagerDashboard from "@/components/dashboard/ManagerDashboard";
import SuperadminDashboard from "@/components/dashboard/SuperadminDashboard";
import MarketingDashboard from "@/components/dashboard/MarketingDashboard";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const role = user.is_superadmin ? "superadmin" : user.role?.name;

  switch (role) {
    case "teacher":
      return <TeacherDashboard />;
    case "secretary":
      return <SecretaryDashboard />;
    case "manager":
      return <ManagerDashboard />;
    case "marketing_manager":
      return <MarketingDashboard />;
    case "superadmin":
      return <SuperadminDashboard />;
    default:
      return <MarketingDashboard />;
  }
}
