from src.security.security import security_hash_password, security_verify_password


class TestSecurity:
    """Test cases for security.py module"""

    def test_security_hash_password(self) -> None:
        """Test password hashing functionality"""
        password = "test_password_123"
        hashed = security_hash_password(password)

        # Verify the hash is different from original password
        assert hashed != password
        # Verify the hash is a string
        assert isinstance(hashed, str)
        # Verify the hash is not empty
        assert len(hashed) > 0

    def test_security_verify_password_correct(self) -> None:
        """Test password verification with correct password"""
        password = "test_password_123"
        hashed = security_hash_password(password)

        # Verify correct password returns True
        assert security_verify_password(password, hashed) is True

    def test_security_verify_password_incorrect(self) -> None:
        """Test password verification with incorrect password"""
        password = "test_password_123"
        wrong_password = "wrong_password_456"
        hashed = security_hash_password(password)

        # Verify incorrect password returns False
        assert security_verify_password(wrong_password, hashed) is False

    def test_security_verify_password_empty_password(self) -> None:
        """Test password verification with empty password"""
        password = "test_password_123"
        hashed = security_hash_password(password)

        # Verify empty password returns False
        assert security_verify_password("", hashed) is False

    def test_security_verify_password_empty_string(self) -> None:
        """Test password verification with empty string"""
        password = "test_password_123"
        hashed = security_hash_password(password)

        # Verify empty string returns False
        assert security_verify_password("", hashed) is False

    def test_password_hashing_consistency(self) -> None:
        """Test that password hashing produces consistent results"""
        password = "consistent_test_password"
        hashed1 = security_hash_password(password)
        hashed2 = security_hash_password(password)

        # Each hash should be different (due to salt)
        assert hashed1 != hashed2

        # But both should verify correctly
        assert security_verify_password(password, hashed1) is True
        assert security_verify_password(password, hashed2) is True

    def test_special_characters_in_password(self) -> None:
        """Test password hashing with special characters"""
        password = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
        hashed = security_hash_password(password)

        assert security_verify_password(password, hashed) is True
        assert security_verify_password("wrong", hashed) is False

    def test_unicode_characters_in_password(self) -> None:
        """Test password hashing with unicode characters"""
        password = "测试密码123🚀🌟"
        hashed = security_hash_password(password)

        assert security_verify_password(password, hashed) is True
        assert security_verify_password("wrong", hashed) is False

    def test_very_long_password(self) -> None:
        """Test password hashing with very long password"""
        password = "a" * 1000
        hashed = security_hash_password(password)

        assert security_verify_password(password, hashed) is True
        assert security_verify_password("wrong", hashed) is False
