from config.config import get_settings
from src.security.rbac import FeatureDisabled


def is_dev_mode_enabled():
    config = get_settings()
    return config.general_config.development_mode


def is_dev_mode_enabled_or_raise() -> bool:
    config = get_settings()
    if config.general_config.development_mode:
        return True
    raise FeatureDisabled(reason="Development mode is disabled")
