import httpx
from app.core.config import settings


def get_async_client() -> httpx.AsyncClient:
    proxy = settings.HTTPS_PROXY or settings.HTTP_PROXY
    if proxy:
        return httpx.AsyncClient(proxies={"http://": proxy, "https://": proxy}, verify=False)
    return httpx.AsyncClient()
