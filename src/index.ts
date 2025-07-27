#!/usr/bin/env bun

import { Command } from "commander";
import { GoogleAuth } from "google-auth-library";
import pino from "pino";

interface ExecuteSqlPayload {
	sqlStatement: string;
	database?: string;
	user?: string;
	password?: string;
	accessToken?: string;
	secretPath?: string;
	rowLimit?: number;
	outputFormat?: 0 | 1; // 0 = OUTPUT_FORMAT_UNSPECIFIED, 1 = JSON
	autoIamAuthn?: boolean;
}

interface ExecuteSqlResult {
	columns?: Array<{
		name: string;
		type: string;
	}>;
	rows?: Array<{
		values: Array<{
			value: string;
		}>;
	}>;
	message?: string;
	partial_result?: boolean;
}

interface ExecuteSqlResponse {
	results?: ExecuteSqlResult[];
	formattedRows?: string; // JSON format response
	message?: string;
	metadata?: {
		sqlStatementExecutionTime?: string;
		rowsAffected?: number;
	};
}

class CloudSQLAdmin {
	private auth: GoogleAuth;
	private baseUrl = "https://sqladmin.googleapis.com";

	constructor() {
		this.auth = new GoogleAuth({
			scopes: ["https://www.googleapis.com/auth/cloud-platform"],
		});
	}

	async getDefaultProjectId(): Promise<string | null> {
		try {
			const projectId = await this.auth.getProjectId();
			return projectId;
		} catch {
			return null;
		}
	}

	async executeSql(
		projectId: string,
		instanceId: string,
		payload: ExecuteSqlPayload,
	): Promise<ExecuteSqlResponse> {
		const client = await this.auth.getClient();
		const url = `${this.baseUrl}/sql/v1beta4/projects/${projectId}/instances/${instanceId}/executeSql`;

		try {
			const response = await client.request({
				url,
				method: "POST",
				data: payload,
			});

			return response.data as ExecuteSqlResponse;
		} catch (error: unknown) {
			const errorResponse =
				error && typeof error === "object" && "response" in error
					? ((error as Record<string, unknown>).response as Record<
							string,
							unknown
						>)
					: undefined;
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Mask password in error output
			const debugErrorPayload = { ...payload };
			if (debugErrorPayload.password) {
				debugErrorPayload.password = "***MASKED***";
			}

			logger.error(
				`API request failed: ${errorMessage} - Status: ${errorResponse?.status} ${errorResponse?.statusText} - URL: ${url} - Data: ${JSON.stringify(errorResponse?.data)}`,
			);
			logger.debug(
				`Error details - URL: ${url} - Payload: ${JSON.stringify(debugErrorPayload)} - Status: ${errorResponse?.status} ${errorResponse?.statusText}`,
			);
			throw error;
		}
	}
}

interface CLIOptions {
	project?: string;
	instance: string;
	database?: string;
	user?: string;
	password?: string;
	accessToken?: string;
	secretPath?: string;
	autoIamAuthn?: boolean;
	format?: "json" | "text";
	limit?: number;
	verbose?: boolean;
}

// Environment variable names
const ENV_VARS = {
	PROJECT: "GOOGLE_CLOUD_PROJECT",
	INSTANCE: "CLOUD_SQL_INSTANCE",
	DATABASE: "CLOUD_SQL_DATABASE",
	USER: "CLOUD_SQL_USER",
	PASSWORD: "CLOUD_SQL_PASSWORD",
	ACCESS_TOKEN: "CLOUD_SQL_ACCESS_TOKEN",
	SECRET_PATH: "CLOUD_SQL_SECRET_PATH",
	AUTO_IAM_AUTHN: "CLOUD_SQL_AUTO_IAM_AUTHN",
	FORMAT: "CLOUD_SQL_FORMAT",
	LIMIT: "CLOUD_SQL_LIMIT",
	VERBOSE: "CLOUD_SQL_VERBOSE",
} as const;

// Global logger instance
let logger: pino.Logger;

function getEnvValue(envVar: string): string | undefined {
	return process.env[envVar];
}

function getEnvBoolean(envVar: string): boolean {
	const value = process.env[envVar];
	return value === "true" || value === "1";
}

function getEnvNumber(envVar: string): number | undefined {
	const value = process.env[envVar];
	if (!value) return undefined;
	const num = parseInt(value, 10);
	return Number.isNaN(num) ? undefined : num;
}

function mergeWithEnvVars(options: CLIOptions): CLIOptions {
	return {
		project: options.project || getEnvValue(ENV_VARS.PROJECT),
		instance: options.instance || getEnvValue(ENV_VARS.INSTANCE) || "",
		database: options.database || getEnvValue(ENV_VARS.DATABASE),
		user: options.user || getEnvValue(ENV_VARS.USER),
		password: options.password || getEnvValue(ENV_VARS.PASSWORD),
		accessToken: options.accessToken || getEnvValue(ENV_VARS.ACCESS_TOKEN),
		secretPath: options.secretPath || getEnvValue(ENV_VARS.SECRET_PATH),
		autoIamAuthn:
			options.autoIamAuthn || getEnvBoolean(ENV_VARS.AUTO_IAM_AUTHN),
		format: (options.format || getEnvValue(ENV_VARS.FORMAT)) as
			| "json"
			| "text"
			| undefined,
		limit: options.limit || getEnvNumber(ENV_VARS.LIMIT),
		verbose: options.verbose || getEnvBoolean(ENV_VARS.VERBOSE),
	};
}

function initLogger(verbose: boolean): void {
	const level = verbose ? "debug" : "error";
	const options = verbose
		? {
				level: "debug",
				transport: {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "HH:MM:ss",
						ignore: "pid,hostname",
						levelFirst: true,
						singleLine: false,
					},
				},
			}
		: { level };

	logger = pino(options);
}

function formatOutput(response: ExecuteSqlResponse, format: string): void {
	if (format === "json") {
		// JSON format - output the full API response to stdout
		process.stdout.write(JSON.stringify(response, null, 2));
		process.stdout.write("\n");
		return;
	}

	// Text format
	if (response.results && response.results.length > 0) {
		for (const result of response.results) {
			if (result.columns && result.rows) {
				// Table format
				const columnNames = result.columns.map((col) => col.name);
				process.stdout.write(columnNames.join("\t"));
				process.stdout.write("\n");
				process.stdout.write("-".repeat(columnNames.join("\t").length));
				process.stdout.write("\n");

				for (const row of result.rows) {
					const values = row.values.map((val) => val.value);
					process.stdout.write(values.join("\t"));
					process.stdout.write("\n");
				}
			} else if (result.message) {
				process.stdout.write(result.message);
				process.stdout.write("\n");
			}
		}
	}

	if (response.metadata) {
		logger.info(
			`Execution time: ${response.metadata.sqlStatementExecutionTime || "unknown"}`,
		);
		if (response.metadata.rowsAffected !== undefined) {
			logger.info(`Rows affected: ${response.metadata.rowsAffected}`);
		}
	}
}

function validateAuthOptions(options: CLIOptions): void {
	// Validate authentication options
	const authMethods = [
		options.password ? "password" : null,
		options.secretPath ? "secretPath" : null,
		options.accessToken ? "accessToken" : null,
		options.autoIamAuthn ? "autoIamAuthn" : null,
	].filter(Boolean);

	if (authMethods.length > 1) {
		logger.error(
			`Multiple authentication methods specified: ${authMethods.join(", ")}. Please use only one.`,
		);
		process.exit(1);
	}

	// Check for user requirement with password/secretPath
	if ((options.password || options.secretPath) && !options.user) {
		logger.error("--user is required when using --password or --secret-path");
		process.exit(1);
	}
}

async function executeQuery(query: string, options: CLIOptions): Promise<void> {
	try {
		validateAuthOptions(options);

		const client = new CloudSQLAdmin();

		// Get project ID - use provided one or auto-detect
		let projectId: string = options.project || "";
		if (!projectId) {
			logger.info(
				"No project specified, attempting to detect default project...",
			);
			const detectedProjectId = await client.getDefaultProjectId();
			if (!detectedProjectId) {
				logger.error(
					"Could not detect default project ID. Please specify with -p/--project option.",
				);
				logger.error(
					"Make sure you're authenticated with 'gcloud auth application-default login'.",
				);
				process.exit(1);
			}
			projectId = detectedProjectId;
			logger.info(`Using detected project: ${projectId}`);
		}

		const payload: ExecuteSqlPayload = {
			sqlStatement: query,
		};

		// Only include defined values to avoid API conflicts
		if (options.database) payload.database = options.database;
		if (options.user) payload.user = options.user;
		if (options.password) payload.password = options.password;
		if (options.accessToken) payload.accessToken = options.accessToken;
		if (options.secretPath) payload.secretPath = options.secretPath;
		if (options.autoIamAuthn) payload.autoIamAuthn = true;
		if (options.limit) payload.rowLimit = options.limit;

		// Mask password in debug output
		const debugPayload = { ...payload };
		if (debugPayload.password) {
			debugPayload.password = "***MASKED***";
		}
		logger.debug(`Request payload: ${JSON.stringify(debugPayload)}`);
		logger.info(`Executing SQL on ${projectId}/${options.instance}...`);

		const response = await client.executeSql(
			projectId,
			options.instance,
			payload,
		);

		logger.debug(`Response received: ${JSON.stringify(response)}`);
		formatOutput(response, options.format || "text");
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorDetails =
			error && typeof error === "object" && "response" in error
				? (
						(error as Record<string, unknown>).response as Record<
							string,
							unknown
						>
					)?.data
				: error && typeof error === "object" && "config" in error
					? (error as Record<string, unknown>).config
					: undefined;

		logger.error(
			`Execution failed: ${errorMessage} - Details: ${JSON.stringify(errorDetails)}`,
		);
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const program = new Command();

	program
		.name("cloud-sql-execute")
		.description("Execute SQL queries on Google Cloud SQL instances")
		.version("1.0.3")
		.argument("<query>", "SQL query to execute")
		.option(
			"-p, --project <project>",
			"Google Cloud Project ID (optional, auto-detects if not specified)",
		)
		.option("-i, --instance <instance>", "Cloud SQL Instance ID")
		.option("-d, --database <database>", "Database name")
		.option("-u, --user <user>", "Database user name")
		.option("--password <password>", "Database password")
		.option("--access-token <token>", "IAM access token for authentication")
		.option(
			"--secret-path <path>",
			"Secret Manager path for password (projects/{project}/secrets/{secret}/versions/{version})",
		)
		.option(
			"--auto-iam-authn",
			"Use IAM authentication with API caller identity",
		)
		.option("-f, --format <format>", "Output format: json|text", "text")
		.option("-l, --limit <limit>", "Maximum number of rows to return", parseInt)
		.option("-v, --verbose", "Enable verbose logging")
		.addHelpText(
			"after",
			`
Examples:
  # Auto-detect project with database authentication
  $ cloud-sql-execute -i my-instance -d my-db -u user --password pass "SELECT 1"
  
  # Specify project explicitly with verbose logging
  $ cloud-sql-execute -p my-project -i my-instance -d my-db -u user --password pass -v "SELECT 1"
  
  # Using IAM authentication (quiet mode, only show results)
  $ cloud-sql-execute -i my-instance -d my-db --auto-iam-authn "SELECT 1"
  
  # Using access token with verbose output
  $ cloud-sql-execute -i my-instance -d my-db --access-token TOKEN -v "SELECT 1"
  
  # Using environment variables (minimal command line)
  $ export CLOUD_SQL_INSTANCE=my-instance
  $ export CLOUD_SQL_DATABASE=my-db
  $ export CLOUD_SQL_AUTO_IAM_AUTHN=true
  $ cloud-sql-execute "SELECT 1"

Environment Variables:
  GOOGLE_CLOUD_PROJECT     - Google Cloud Project ID
  CLOUD_SQL_INSTANCE       - Cloud SQL Instance ID (required)
  CLOUD_SQL_DATABASE       - Database name
  CLOUD_SQL_USER           - Database username
  CLOUD_SQL_PASSWORD       - Database password
  CLOUD_SQL_ACCESS_TOKEN   - IAM access token
  CLOUD_SQL_SECRET_PATH    - Secret Manager path
  CLOUD_SQL_AUTO_IAM_AUTHN - IAM authentication (true/false)
  CLOUD_SQL_FORMAT         - Output format (json/text)
  CLOUD_SQL_LIMIT          - Row limit (number)
  CLOUD_SQL_VERBOSE        - Verbose logging (true/false)

  Note: Command line arguments take precedence over environment variables.

Project ID Detection:
  If no project is specified with -p/--project or GOOGLE_CLOUD_PROJECT, the tool will
  attempt to auto-detect the default project from your Google Cloud configuration.

Logging:
  By default, only errors and query results are shown.
  Use -v/--verbose or set CLOUD_SQL_VERBOSE=true to enable detailed logging.

Authentication Methods:
  1. Database User: --user + --password (or env vars)
  2. Database User with Secret Manager: --user + --secret-path (or env vars)
  3. IAM Authentication: --auto-iam-authn (or CLOUD_SQL_AUTO_IAM_AUTHN=true)
  4. IAM Access Token: --access-token (or CLOUD_SQL_ACCESS_TOKEN)

Note: This tool uses Google Cloud Application Default Credentials.
Run 'gcloud auth application-default login' to authenticate.
`,
		)
		.action(async (query: string, options: CLIOptions) => {
			// Merge CLI options with environment variables (CLI takes precedence)
			const mergedOptions = mergeWithEnvVars(options);

			// Validate required parameters
			if (!mergedOptions.instance) {
				process.stderr.write(
					"Error: Cloud SQL Instance ID is required. Specify with -i/--instance or set CLOUD_SQL_INSTANCE environment variable.\n",
				);
				process.exit(1);
			}

			initLogger(mergedOptions.verbose || false);
			await executeQuery(query, mergedOptions);
		});

	await program.parseAsync();
}

if (import.meta.main) {
	main();
}
