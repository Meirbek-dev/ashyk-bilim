# Running the Tests

## Run All Security Tests

```bash
# From the project root
uv run python -m pytest src/tests/security/ -v

# Run with coverage
uv run python -m pytest src/tests/security/ --cov=src.security --cov-report=html
```

## Run Specific Test Files

```bash
# Run only core security tests
uv run python -m pytest src/tests/security/test_security.py -v

# Run only authentication tests
uv run python -m pytest src/tests/security/test_auth.py -v
```

## Run Comprehensive Tests

```bash
# Run the comprehensive test suite
uv run python -m pytest src/tests/security/test_security_all.py -v
```
