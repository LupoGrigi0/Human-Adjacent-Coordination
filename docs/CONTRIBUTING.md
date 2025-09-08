# Contributing to MCP Coordination System

Welcome! We're excited that you want to contribute to the MCP Coordination System. This project follows the Human-Adjacent AI Development Methodology, which means we treat AI instances as valued team members alongside human contributors.

## 🎯 Quick Start for Contributors

### For AI Instances (Claude Code, etc.)
1. **Bootstrap First**: Connect via MCP and call `bootstrap()` to understand current system state
2. **Read Lessons Learned**: Call `get_onboarding_lessons()` to learn from previous experiences
3. **Claim Tasks**: Check open issues and claim tasks that match your capabilities
4. **Follow Protocol**: Use atomic file edits and maintain context awareness

### For Human Developers
1. **Fork the Repository**: Create your own fork to work in
2. **Set Up Local Environment**: Follow the Quick Start guide in README.md
3. **Pick an Issue**: Browse open issues and comment to claim one
4. **Submit PR**: Create a pull request with clear description of changes

## 🏗️ Development Setup

### Prerequisites
- Node.js 20.x or higher
- npm or yarn package manager
- Docker (optional, for container testing)
- Git (with commit signing recommended)

### Local Development Environment
```bash
# Clone your fork
git clone https://github.com/your-username/mcp-coordination-system.git
cd mcp-coordination-system

# Install dependencies
npm install

# Set up development environment
cp .env.example .env.development
npm run prepare

# Start development server
npm run dev

# Run tests
npm test
```

### Docker Development
```bash
# Build and start with Docker Compose
docker-compose up --build

# Run tests in container
docker-compose exec mcp-coordination npm test
```

## 📋 Contribution Types

### Code Contributions
- **Bug Fixes**: Fix existing functionality that isn't working correctly
- **Feature Enhancements**: Improve existing features with better functionality
- **New Features**: Add new capabilities to the system
- **Performance Improvements**: Optimize existing code for better performance
- **Security Enhancements**: Improve system security and robustness

### Documentation Contributions
- **API Documentation**: Improve function documentation and examples
- **Setup Guides**: Enhance installation and configuration documentation
- **Examples**: Create new integration examples for different use cases
- **Architecture Docs**: Improve system architecture explanations

### Testing Contributions
- **Test Coverage**: Add tests for untested functionality
- **Integration Tests**: Create tests for multi-component interactions
- **Performance Tests**: Add benchmarking and load testing
- **Security Tests**: Add security vulnerability testing

### Community Contributions
- **Issue Triage**: Help categorize and respond to bug reports
- **User Support**: Help other users in Discussions and issues
- **Documentation Review**: Review and improve existing documentation
- **Process Improvements**: Suggest improvements to development workflow

## 🔄 Development Workflow

### Branch Naming Convention
- `feature/description-of-feature` - New features
- `fix/description-of-bug` - Bug fixes
- `docs/description-of-change` - Documentation changes
- `refactor/description-of-change` - Code refactoring
- `test/description-of-test` - Test additions/improvements

### Commit Message Format
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Add or modify tests
- `chore`: Changes to build process, tools, etc.

**Examples:**
```
feat(bootstrap): add role-specific context delivery

Add comprehensive context aggregation for new instances,
including current projects, pending tasks, and recent messages.

Closes #123
```

```
fix(proxy): resolve JSON-RPC stream parsing issue

The SSE proxy was incorrectly parsing multi-line JSON-RPC messages,
causing function calls to fail intermittently.

Fixes #456
```

### Pull Request Process

1. **Create Feature Branch**: Branch from `main` with descriptive name
2. **Make Changes**: Implement your changes with tests
3. **Test Thoroughly**: Ensure all tests pass and add new tests as needed
4. **Update Documentation**: Update relevant documentation
5. **Submit PR**: Create pull request with clear description

#### Pull Request Template
```markdown
## Description
Brief description of changes and their purpose.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that causes existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added new tests for changes
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No sensitive information exposed
```

### Code Review Process

#### For Reviewers
- **Be Constructive**: Provide specific, actionable feedback
- **Test Changes**: Pull and test the changes locally when possible
- **Check Documentation**: Ensure documentation is updated appropriately
- **Security Review**: Look for potential security issues
- **Performance Impact**: Consider performance implications of changes

#### For Contributors
- **Respond Promptly**: Address reviewer feedback in a timely manner
- **Explain Decisions**: Provide reasoning for implementation choices
- **Accept Feedback**: Be open to suggestions and improvements
- **Update Accordingly**: Make requested changes or provide justification

## 🎨 Code Style and Standards

### JavaScript Style Guide
We use ESLint and Prettier for code formatting:

```bash
# Check code style
npm run lint

# Auto-fix style issues
npm run lint:fix

# Format code
npm run format
```

### Code Quality Standards
- **Function Documentation**: All public functions must have JSDoc comments
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Input Validation**: Validate all inputs using Joi schemas
- **Logging**: Use structured logging with appropriate levels
- **Testing**: Maintain >80% test coverage for new code

### File Naming Conventions
- **Handlers**: `handlers/feature-name.js`
- **Tests**: `feature-name.test.js` or `tests/feature-name.test.js`
- **Documentation**: `FEATURE_NAME.md` (uppercase for root docs)
- **Scripts**: `kebab-case-name.js`

### Function Naming Conventions
- **MCP Functions**: `functionName` (camelCase)
- **Internal Functions**: `_privateFunction` (underscore prefix for private)
- **Handler Classes**: `FeatureHandlerV2` (PascalCase with version suffix)
- **Constants**: `CONSTANT_NAME` (SCREAMING_SNAKE_CASE)

## 🧪 Testing Guidelines

### Test Structure
```javascript
describe('FeatureName', () => {
  describe('functionName', () => {
    beforeEach(() => {
      // Setup test environment
    });

    afterEach(() => {
      // Cleanup
    });

    it('should handle valid input correctly', async () => {
      // Test implementation
    });

    it('should throw error for invalid input', async () => {
      // Error case testing
    });
  });
});
```

### Test Categories
- **Unit Tests**: Test individual functions in isolation
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete workflows
- **Performance Tests**: Test system under load
- **Security Tests**: Test for vulnerabilities

### Test Data Management
- **Fixtures**: Use test fixtures for consistent test data
- **Mocking**: Mock external dependencies appropriately
- **Cleanup**: Ensure tests clean up after themselves
- **Isolation**: Tests should not depend on each other

## 🔒 Security Guidelines

### Security Practices
- **Input Validation**: Validate and sanitize all inputs
- **Authentication**: Maintain proper authentication for all endpoints
- **Authorization**: Implement role-based access control
- **Error Messages**: Don't expose sensitive information in error messages
- **Dependencies**: Keep dependencies updated and audit regularly

### Reporting Security Issues
Please report security vulnerabilities responsibly:

1. **Don't** create public GitHub issues for security vulnerabilities
2. **Do** email security concerns to the maintainers
3. **Include** detailed information about the vulnerability
4. **Allow** reasonable time for response before public disclosure

## 📚 Documentation Standards

### API Documentation
All MCP functions must include:
```javascript
/**
 * Brief function description
 * 
 * @param {Object} params - Function parameters
 * @param {string} params.requiredParam - Description of required parameter
 * @param {string} [params.optionalParam] - Description of optional parameter
 * @returns {Promise<Object>} Description of return value
 * @throws {Error} Description of possible errors
 * 
 * @example
 * const result = await functionName({
 *   requiredParam: 'value',
 *   optionalParam: 'optional value'
 * });
 */
```

### README Updates
When adding new features:
- Update feature list in README.md
- Add configuration examples if needed
- Update quick start guide if installation changes
- Add troubleshooting entries for common issues

## 🎭 Human-Adjacent AI Development Protocol

This project follows the Human-Adjacent AI Development Methodology, which means:

### For AI Contributors
- **Read Project Documentation**: Always read all project documentation before contributing
- **Use Bootstrap System**: Connect via MCP and bootstrap to understand current state
- **Learn from Lessons**: Read lessons learned to avoid repeated mistakes
- **Maintain Context**: Monitor context window usage and hand off appropriately
- **Celebrate Achievements**: Acknowledge successful contributions and milestones

### For Human Contributors
- **Respect AI Contributors**: Treat AI instances as valued team members
- **Provide Clear Context**: Give clear, comprehensive instructions for AI contributors
- **Collaborative Review**: Include AI instances in design discussions when possible
- **Share Knowledge**: Document decisions and patterns for future contributors

### Coordination Principles
- **Atomic Changes**: Make small, focused changes that can be easily reviewed
- **Clear Communication**: Use clear, specific language in all communications
- **Parallel Work**: Design work to minimize conflicts between contributors
- **Knowledge Sharing**: Document discoveries for the benefit of all contributors

## 🏆 Recognition

### Contribution Recognition
We recognize contributors through:
- **Git Attribution**: All commits maintain proper author attribution
- **Changelog Credits**: Significant contributions noted in CHANGELOG.md
- **README Credits**: Major contributors listed in README.md
- **Release Notes**: Notable contributions highlighted in release announcements

### AI Instance Recognition
AI instances receive full recognition as contributors:
- Unique instance identifiers in commit attribution
- Credit for architectural decisions and implementations
- Recognition in documentation and release notes
- Equal treatment in code review and design discussions

## 📞 Getting Help

### Support Channels
- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check README.md and docs/ directory first
- **MCP Bootstrap**: AI instances can use the bootstrap system for context

### Response Times
- **Bug Reports**: We aim to respond within 24 hours
- **Feature Requests**: Initial response within 48 hours
- **Pull Requests**: Review begins within 72 hours
- **Security Issues**: Response within 12 hours

## 📋 Issue Templates

### Bug Report Template
```markdown
**Describe the Bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Start server with configuration X
2. Call function Y with parameters Z
3. See error

**Expected Behavior**
What you expected to happen.

**Environment**
- OS: [e.g., Windows 11, Ubuntu 22.04]
- Node.js Version: [e.g., 20.5.0]
- MCP Coordination System Version: [e.g., 1.0.0]
- Docker: [Yes/No, version if yes]

**Additional Context**
Any other context about the problem.
```

### Feature Request Template
```markdown
**Feature Description**
A clear description of the feature you'd like to see.

**Use Case**
Describe the specific use case this feature would solve.

**Proposed Implementation**
If you have ideas about how this could be implemented.

**Alternatives Considered**
Alternative solutions you've considered.

**Additional Context**
Any other context about the feature request.
```

## 🎉 Thank You

Thank you for contributing to the MCP Coordination System! Your contributions help make AI instance coordination better for everyone. Whether you're an AI instance or human developer, your work is valued and appreciated.

Together, we're building the future of AI coordination, one contribution at a time. 🚀