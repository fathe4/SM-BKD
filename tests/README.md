# Feed Posts Testing Suite

This directory contains comprehensive automated tests for the social media feed system, focusing on the `getFeedPosts` functionality and related components.

## 📁 Test Structure

```
tests/
├── feed.test.ts          # Main feed functionality tests
├── setup.ts             # Global test configuration
├── run-feed-tests.sh    # Test runner script
└── README.md           # This documentation
```

## 🧪 Test Categories

### **1. Integration Tests**
- **Full Feed Flow**: Tests the complete `getFeedPosts` method with realistic data
- **Mixed Content Scenarios**: Validates proper mixing of friends, boosted, friend-liked, and public posts
- **User State Variations**: Tests different user scenarios (with/without friends, location, etc.)

### **2. Unit Tests**
- **Individual Helper Methods**: Tests each private method in isolation
- **Cache Operations**: Validates Redis caching behavior
- **Data Transformation**: Tests feed mixing algorithms

### **3. Performance Tests**
- **Response Time**: Ensures feed generation completes within acceptable timeframes
- **Large Data Sets**: Tests behavior with many friends, posts, and boosts
- **Concurrent Requests**: Validates system behavior under load

### **4. Error Handling Tests**
- **Database Failures**: Tests graceful handling of Supabase errors
- **Cache Failures**: Tests behavior when Redis is unavailable
- **Data Integrity**: Tests handling of malformed or missing data

## 🎯 Key Test Scenarios

### **User Types Tested:**
- ✅ User with friends and location
- ✅ User with friends but no location  
- ✅ User with location but no friends
- ✅ New user (no friends, no location)

### **Content Scenarios:**
- ✅ Feed with all post types available
- ✅ Feed with only friend posts available
- ✅ Feed with only public posts available
- ✅ Feed with boosted posts (seen/unseen)
- ✅ Friend-liked posts integration
- ✅ Empty feed scenarios

### **Feed Composition:**
- ✅ Friend posts prioritization
- ✅ Boosted posts interspersion (every 3-4 positions)
- ✅ Friend-liked posts placement (every 5th position)
- ✅ Public posts filling remaining slots
- ✅ Always reaching requested limit (10 posts)

### **Caching Scenarios:**
- ✅ Cache hit vs cache miss
- ✅ Cache invalidation after new posts
- ✅ Cache invalidation after likes/unlikes
- ✅ Cache invalidation after boost activation

## 🚀 Running Tests

### **Quick Start**
```bash
# Run all feed tests
npm test tests/feed.test.ts

# Run with coverage
npm test tests/feed.test.ts -- --coverage

# Using the test runner script
./tests/run-feed-tests.sh
```

### **Development Mode**
```bash
# Watch mode for active development
npm test tests/feed.test.ts -- --watch

# Specific test pattern
npm test tests/feed.test.ts -- --testNamePattern="should return mixed feed"

# Debug mode
npm test tests/feed.test.ts -- --detectOpenHandles --forceExit
```

### **Coverage Reports**
```bash
# Generate detailed coverage
npm test tests/feed.test.ts -- --coverage --coverageReporters=html

# View coverage report
open coverage/lcov-report/index.html
```

## 📊 Test Data Factory

The tests use a `FeedTestDataFactory` class to create consistent test data:

```typescript
// Create test users
FeedTestDataFactory.createUser('user1', { username: 'testuser' })

// Create test posts
FeedTestDataFactory.createPost('post1', 'user1', { content: 'Test post' })

// Create boosted posts
FeedTestDataFactory.createBoostedPost('boost1', 'user1', 'Bangladesh')

// Create friendships
FeedTestDataFactory.createFriendship('user1', 'user2')

// Create reactions
FeedTestDataFactory.createReaction('user1', 'post1', 'like')
```

## 🔧 Mock Configuration

Tests use comprehensive mocking for:

- **Supabase**: Database queries and responses
- **Redis**: Caching operations
- **Logger**: Logging operations to reduce test noise

## 📈 Performance Benchmarks

### **Expected Performance:**
- **Cache Hit**: < 50ms
- **Cache Miss**: < 500ms
- **Large Friend List (100+ friends)**: < 1000ms
- **Complex Mixed Feed**: < 800ms

### **Feed Composition Validation:**
- Friend posts appear first in feed
- Boosted posts interspersed at positions 3, 7, etc.
- Friend-liked posts at every 5th position after friends
- Feed always reaches requested limit
- No duplicate boosted posts for same user

## 🐛 Common Issues & Solutions

### **Test Failures:**

**1. Mock Not Working:**
```bash
# Clear Jest cache
npx jest --clearCache
```

**2. Timeout Issues:**
```bash
# Increase timeout in jest.config.js
testTimeout: 15000
```

**3. Coverage Issues:**
```bash
# Exclude specific files from coverage
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/types/**/*.ts'
]
```

## 🎯 Coverage Goals

- **Overall Coverage**: > 70%
- **PostService Coverage**: > 80%
- **Feed Methods**: > 90%

## 🔄 Continuous Testing

### **Pre-commit Testing:**
```bash
# Add to package.json scripts
"test:feed": "jest tests/feed.test.ts",
"test:feed:coverage": "jest tests/feed.test.ts --coverage",
"test:feed:ci": "jest tests/feed.test.ts --ci --coverage --maxWorkers=2"
```

### **CI/CD Integration:**
```yaml
# Example GitHub Actions
- name: Run Feed Tests
  run: npm run test:feed:ci
  
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

## 📚 Testing Best Practices

1. **Isolation**: Each test is independent and can run in any order
2. **Descriptive Names**: Test names clearly describe the scenario
3. **Arrange-Act-Assert**: Clear test structure
4. **Realistic Data**: Test data mirrors production scenarios
5. **Error Cases**: Both success and failure paths are tested
6. **Performance**: Tests include timing assertions

## 🔍 Debugging Tests

### **Common Debug Commands:**
```bash
# Run single test with full output
npm test tests/feed.test.ts -- --testNamePattern="should prioritize friend posts" --verbose

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest tests/feed.test.ts --runInBand

# Verbose logging
DEBUG=* npm test tests/feed.test.ts
```

### **Useful Debug Techniques:**
- Add `console.log` in test data factory
- Use `expect.objectContaining()` for partial matches
- Check mock call history with `expect(mockFn).toHaveBeenCalledWith()`

## 📝 Adding New Tests

When adding new feed features:

1. **Update Test Data Factory** with new data types
2. **Add Unit Tests** for new helper methods
3. **Add Integration Tests** for new feed behavior
4. **Update Mock Configuration** for new dependencies
5. **Document Expected Behavior** in test descriptions

## 🎭 Test Environment

Tests run in an isolated environment with:
- **Mock Database**: Supabase responses are mocked
- **Mock Cache**: Redis operations are mocked
- **Test Data**: Consistent, predictable test data
- **No Side Effects**: Tests don't affect real data

This ensures tests are:
- **Fast**: No real network calls
- **Reliable**: Consistent results
- **Isolated**: Independent execution
- **Maintainable**: Clear test structure

---

*Happy Testing! 🧪*
