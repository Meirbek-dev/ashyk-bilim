import uvicorn

from config.config import get_settings
from src.app.factory import create_app

app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    is_dev_mode = settings.general_config.development_mode
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=settings.hosting_config.port,
        reload=is_dev_mode,
        access_log=is_dev_mode,
        timeout_keep_alive=65,
        proxy_headers=settings.hosting_config.proxy_headers,
        forwarded_allow_ips=settings.hosting_config.forwarded_allow_ips,
    )
