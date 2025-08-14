# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that enables AI assistants like Claude to interact with Microsoft SQL Server databases. The server acts as a bridge between AI models and SQL Server, providing secure and controlled database access through a standardized tool interface.

## Development Commands

### Essential Commands
- `npm run build` - Compile TypeScript to JavaScript in the `dist/` directory
- `npm run watch` - Compile TypeScript with watch mode for development
- `npm start` - Run the compiled server from `dist/index.js`
- `npm install` - Install dependencies
- `npm run prepare` - Automatically runs build (configured as prepare script)

### Testing
- No specific test framework is configured in this project
- Manual testing can be done by configuring the server with Claude Desktop or VS Code Agent and testing database operations

## Architecture

### Core Components

**Main Server (`src/index.ts`)**
- MCP server implementation using `@modelcontextprotocol/sdk`
- Manages Azure AD authentication with token refresh logic
- Implements connection pooling with automatic reconnection
- Supports read-only mode via `READONLY` environment variable
- Uses `StdioServerTransport` for communication

**Tool System (`src/tools/`)**
All tools follow a consistent pattern:
- Implement the `Tool` interface from MCP SDK
- Define JSON schemas for input validation
- Use parameterized queries for SQL injection prevention
- Return standardized response objects with `success` and `message` fields

**Available Tools:**
- `ReadDataTool` - Query data with extensive security validation
- `InsertDataTool` - Insert single records or bulk data
- `UpdateDataTool` - Update records with required WHERE clauses
- `CreateTableTool` - Create new tables with column definitions
- `DropTableTool` - Remove tables from database
- `CreateIndexTool` - Create database indexes
- `ListTableTool` - List all tables in the database
- `DescribeTableTool` - Get table schema and foreign key information

### Security Architecture

**Authentication:** Uses SQL Server username/password authentication

**SQL Injection Prevention:**
- All tools use parameterized queries
- `ReadDataTool` implements comprehensive query validation
- Dangerous keywords and patterns are detected and blocked
- Multi-statement queries are prevented

**Access Control:**
- Read-only mode restricts available tools
- Update operations require explicit WHERE clauses
- Connection timeout and trust certificate options configurable

### Configuration

**Environment Variables:**
- `SERVER_NAME` - SQL Server hostname (required)
- `DATABASE_NAME` - Target database name (required)
- `SQL_USERNAME` - SQL Server username for authentication (required)
- `SQL_PASSWORD` - SQL Server password for authentication (required)
- `READONLY` - Set to "true" for read-only mode (optional)
- `CONNECTION_TIMEOUT` - Connection timeout in seconds (default: 30)
- `TRUST_SERVER_CERTIFICATE` - Trust self-signed certificates (default: false)

**Integration Paths:**
- Claude Desktop: Configure in `claude_desktop_config.json`
- VS Code Agent: Configure in `.vscode/mcp.json` or user settings
- Sample configurations available in `src/samples/`

## Development Patterns

### Adding New Tools
1. Create new TypeScript class in `src/tools/`
2. Implement the `Tool` interface with `name`, `description`, `inputSchema`, and `run()` method
3. Import and instantiate in `src/index.ts`
4. Add to appropriate tools array (read-only or full access)
5. Add tool to request handler switch statement
6. Apply connection wrapper with `wrapToolRun()`

### Connection Management
- Global connection pool (`globalSqlPool`) is reused across requests
- Simple connection management without token refresh
- Connection established lazily on first tool execution
- All tools are wrapped to ensure connection before execution

### Error Handling
- Consistent error response format across all tools
- SQL errors are caught and returned as structured responses
- Connection failures trigger automatic reconnection

## Code Style
- TypeScript with ES2020 target and ES2020 modules
- Strict mode enabled
- Use parameterized queries exclusively
- Bracket notation for SQL Server identifiers
- Async/await pattern for all database operations