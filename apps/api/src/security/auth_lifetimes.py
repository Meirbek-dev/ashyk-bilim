from datetime import timedelta

ACCESS_TOKEN_EXPIRE = timedelta(hours=8)
REFRESH_TOKEN_EXPIRE = timedelta(days=30)  # sliding refresh window
REFRESH_TOKEN_HARD_CAP_EXPIRE = timedelta(days=90)
