# WabiSaby Test Suite

This directory contains the test suite for WabiSaby, using Bun's built-in test runner.

## Structure

```
tests/
├── unit/              # Unit tests for isolated functions
│   ├── utils/         # Utility function tests
│   └── core/          # Core module tests
├── integration/       # Integration tests
│   ├── api/           # API route tests
│   └── database/      # Database integration tests
├── fixtures/          # Test data and fixtures
├── mocks/             # Mock implementations
└── helpers/           # Test utilities and helpers
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/core/queue.test.js

# Run with watch mode
bun test:watch

# Run with coverage (when available)
bun test:coverage
```

## Test Coverage

### Completed Tests

- ✅ **Queue Manager** - Comprehensive tests for queue operations, priority logic, state management
- ✅ **Database Service** - CRUD operations, state persistence, data integrity
- ✅ **Utility Functions** - URL validation, string normalization, cache management, rate limiting
- ✅ **API Routes** - Queue endpoint functionality (via queue manager tests)
- ⚠️ **Player Core** - Basic backend detection (full tests require process mocking)

### Test Utilities

- **test-db.js** - Database test helpers for creating and managing test databases
- **test-mocks.js** - Common mocks for logger, file system, processes
- **test-fixtures.js** - Sample test data for songs, queue items, users, etc.

## Writing New Tests

### Unit Tests

Create test files in `tests/unit/` matching the source structure:

```javascript
const { test, expect, beforeEach } = require('bun:test');

beforeEach(() => {
    // Setup
});

test('should do something', () => {
    expect(something).toBe(expected);
});
```

### Integration Tests

Create test files in `tests/integration/` for tests that require multiple components:

```javascript
const { test, expect } = require('bun:test');
const dbService = require('../../../src/database/db.service');

test('should integrate components', async () => {
    // Test integration
});
```

## Mocking

For components that require mocking:

1. Use mocks from `tests/mocks/`
2. Create new mocks in `tests/mocks/` as needed
3. Use test fixtures from `tests/fixtures/` for sample data

## CI/CD

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

See `.github/workflows/test.yml` for CI configuration.

## Best Practices

1. **Isolation**: Each test should be independent
2. **Naming**: Use descriptive test names
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Mock External Dependencies**: Don't test external libraries
5. **Test Behavior, Not Implementation**: Focus on what, not how
6. **Keep Tests Fast**: Use mocks for slow operations
7. **Test Edge Cases**: Empty inputs, null values, error conditions
8. **Cleanup**: Always clean up test data and mocks

