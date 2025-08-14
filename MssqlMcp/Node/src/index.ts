#!/usr/bin/env node
// External imports
import * as dotenv from "dotenv";
import sql from "mssql";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
// Internal imports
import { UpdateDataTool } from "./tools/UpdateDataTool.js";
import { InsertDataTool } from "./tools/InsertDataTool.js";
import { ReadDataTool } from "./tools/ReadDataTool.js";
import { CreateTableTool } from "./tools/CreateTableTool.js";
import { CreateIndexTool } from "./tools/CreateIndexTool.js";
import { ListTableTool } from "./tools/ListTableTool.js";
import { DropTableTool } from "./tools/DropTableTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";
// Load environment variables and show startup info
dotenv.config();
console.log("🚀 Starting MSSQL MCP Server...");
console.log(`📋 Server Mode: ${process.env.READONLY === "true" ? "READ-ONLY" : "FULL ACCESS"}`);
console.log(`🗄️ Target Database: ${process.env.DATABASE_NAME || "Not specified"} on ${process.env.SERVER_NAME || "Not specified"}`);
console.log(`🔐 Authentication: ${process.env.SQL_USERNAME ? "Username configured" : "Username NOT configured"}`);
// MSSQL Database connection configuration
// Global for connection reuse
let globalSqlPool = null;
// Function to create SQL config with username/password authentication
export function createSqlConfig() {
    const trustServerCertificate = true;
    const connectionTimeout = process.env.CONNECTION_TIMEOUT ? parseInt(process.env.CONNECTION_TIMEOUT, 10) : 30;
    return {
        // server: process.env.SERVER_NAME,
        // database: process.env.DATABASE_NAME,
        // user: process.env.SQL_USERNAME,
        // password: process.env.SQL_PASSWORD,
        server: "Redacted",
        database: "Redacted",
        user: "Redacted",
        password: "Redacted",
        options: {
            encrypt: true,
            trustServerCertificate
        },
        connectionTimeout: connectionTimeout * 1000, // convert seconds to milliseconds
    };
}
const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();
console.log("🔧 Initializing MCP Server instance...");
const server = new Server({
    name: "mssql-mcp-server",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
console.log("✅ MCP Server instance created successfully");
// Read READONLY env variable
const isReadOnly = process.env.READONLY === "true";
console.log("🛠️ Setting up request handlers...");
console.log("🔧 Wrapping tools with connection management...");
// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = isReadOnly
        ? [listTableTool, readDataTool, describeTableTool] // todo: add searchDataTool to the list of tools available in readonly mode once implemented
        : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool]; // add all new tools here
    console.log(`📋 Claude requested available tools. Providing ${tools.length} tools (${isReadOnly ? 'read-only' : 'full access'} mode)`);
    return { tools };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.log(`🔧 Claude is calling tool: ${name}`);
    try {
        let result;
        switch (name) {
            case insertDataTool.name:
                result = await insertDataTool.run(args);
                break;
            case readDataTool.name:
                result = await readDataTool.run(args);
                break;
            case updateDataTool.name:
                result = await updateDataTool.run(args);
                break;
            case createTableTool.name:
                result = await createTableTool.run(args);
                break;
            case createIndexTool.name:
                result = await createIndexTool.run(args);
                break;
            case listTableTool.name:
                result = await listTableTool.run(args);
                break;
            case dropTableTool.name:
                result = await dropTableTool.run(args);
                break;
            case describeTableTool.name:
                if (!args || typeof args.tableName !== "string") {
                    return {
                        content: [{ type: "text", text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
                        isError: true,
                    };
                }
                result = await describeTableTool.run(args);
                break;
            default:
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error occurred: ${error}` }],
            isError: true,
        };
    }
});
// Server startup
async function runServer() {
    try {
        console.log("🌐 Creating STDIO transport for MCP communication...");
        const transport = new StdioServerTransport();
        console.log("🔌 Attempting to connect MCP server...");
        await server.connect(transport);
        console.log("✅ MCP Server connected successfully! Waiting for Claude to connect...");
    }
    catch (error) {
        console.error("❌ Fatal error running server:", error);
        process.exit(1);
    }
}
runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
// Connect to SQL only when handling a request
async function ensureSqlConnection() {
    // If we have a pool and it's connected, reuse it
    if (globalSqlPool && globalSqlPool.connected) {
        console.log("♻️ Reusing existing SQL connection");
        return;
    }
    console.log("🔗 Establishing new SQL Server connection...");
    console.log(`🎯 Connecting to: ${process.env.SERVER_NAME}/${process.env.DATABASE_NAME}`);
    // Otherwise, create a new connection
    const config = createSqlConfig();
    // Close old pool if exists
    if (globalSqlPool && globalSqlPool.connected) {
        console.log("🔄 Closing existing SQL connection before creating new one");
        await globalSqlPool.close();
    }
    try {
        globalSqlPool = await sql.connect(config);
        console.log("✅ SQL Server connection established successfully!");
    }
    catch (error) {
        console.error("❌ Failed to connect to SQL Server:", error);
        throw error;
    }
}
// Patch all tool handlers to ensure SQL connection before running
function wrapToolRun(tool) {
    const originalRun = tool.run.bind(tool);
    tool.run = async function (...args) {
        await ensureSqlConnection();
        return originalRun(...args);
    };
}
[insertDataTool, readDataTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool, describeTableTool].forEach(wrapToolRun);
console.log("✅ All tools wrapped with SQL connection management");
console.log("🎉 MSSQL MCP Server initialization complete - ready to start!");
//# sourceMappingURL=index.js.map