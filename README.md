# cloud-sql-execute

A CLI tool that executes SQL statements using Google Cloud SQL Admin API's ExecuteSql method.
Like Cloud SQL Studio, it allows direct SQL execution against Cloud SQL instances.

Built with Commander.js for maintainable TypeScript implementation.

## Development Motivation

This package exists because the `cloudsql.instances.executeSql` API of Google Cloud SQL Admin API v1beta4 is **not implemented in the official Google Cloud Node.js SDK client**. This package will become unnecessary once the ExecuteSQL API is implemented in the [official SDK](https://github.com/googleapis/google-cloud-node/tree/main/packages/google-cloud-sql).
At the time of this library implementation, the ExecuteSQL API has no official documentation.

### Current Status and Use Cases

- **Current Usage**: This API is currently used by Cloud SQL Studio in the Google Cloud console.
- **Stability**: Since this is already a released feature in Cloud SQL Studio, it is unlikely that the functionality will change significantly.
- **Main Advantage**: Enables SQL execution on Cloud SQL instances with **private IP only** without connector configuration.
- **Recommendation**: For performance-critical access, we recommend using more stable connection methods such as Cloud SQL Proxy.

## Installation

### Using bunx (Recommended)
```bash
bunx cloud-sql-execute --help
```

### Using npx
```bash
npx cloud-sql-execute --help
```

### Global Installation
```bash
npm install -g cloud-sql-execute
# or
bun install -g cloud-sql-execute
```

### Development Installation
```bash
git clone https://github.com/k2wanko/cloud-sql-execute.git
cd cloud-sql-execute
bun install
```

## Authentication Setup

Uses Google Cloud Application Default Credentials:

```bash
gcloud auth application-default login
```

## Usage

### Command Line Arguments

```bash
# Basic usage (auto-detect project ID, results only)
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME -u USERNAME --password PASSWORD "SELECT 1"

# Run with verbose logging
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME -u USERNAME --password PASSWORD -v "SELECT 1"

# Use IAM authentication (auto-detect project ID)
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME --auto-iam-authn "SELECT 1"

# Use access token (with verbose logging)
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME --access-token TOKEN -v "SELECT 1"
```

### Environment Variables (Recommended)

Set up environment variables to minimize command line arguments:

```bash
# Set common configuration
export CLOUD_SQL_INSTANCE=my-instance
export CLOUD_SQL_DATABASE=postgres
export CLOUD_SQL_AUTO_IAM_AUTHN=true

# Now you can run with minimal command
bunx cloud-sql-execute "SELECT 1"

# Or with database authentication
export CLOUD_SQL_USER=myuser
export CLOUD_SQL_PASSWORD=mypass
unset CLOUD_SQL_AUTO_IAM_AUTHN  # Remove IAM auth
bunx cloud-sql-execute "SELECT * FROM users LIMIT 5"

# Verbose mode with environment variable
export CLOUD_SQL_VERBOSE=true
bunx cloud-sql-execute "SELECT version()"
```

### Mixed Usage

Command line arguments take precedence over environment variables:

```bash
# Use env vars for common settings, override specific ones
export CLOUD_SQL_INSTANCE=my-instance
export CLOUD_SQL_DATABASE=postgres
export CLOUD_SQL_AUTO_IAM_AUTHN=true

# Override database for this specific query
bunx cloud-sql-execute -d test_db "SELECT 1"
```

## Options

### Command Line Arguments

- `-p, --project`: Google Cloud Project ID (optional, auto-detects if not specified)
- `-i, --instance`: Cloud SQL Instance ID (required)
- `-d, --database`: Database name (required)
- `-u, --user`: Database username
- `--password`: Database password
- `--access-token`: IAM access token for authentication
- `--secret-path`: Secret Manager password reference path
- `--auto-iam-authn`: Use IAM authentication (API caller identity)
- `-f, --format`: Output format (json|text, default: text)
- `-l, --limit`: Maximum number of rows to return
- `-v, --verbose`: Enable verbose logging
- `-h, --help`: Show help message

### Environment Variables

| Variable | Description | Type | Example |
|----------|-------------|------|---------|
| `GOOGLE_CLOUD_PROJECT` | Google Cloud Project ID | string | `my-project` |
| `CLOUD_SQL_INSTANCE` | Cloud SQL Instance ID (**required**) | string | `my-instance` |
| `CLOUD_SQL_DATABASE` | Database name | string | `postgres` |
| `CLOUD_SQL_USER` | Database username | string | `myuser` |
| `CLOUD_SQL_PASSWORD` | Database password | string | `mypass` |
| `CLOUD_SQL_ACCESS_TOKEN` | IAM access token | string | `ya29.c.b0A...` |
| `CLOUD_SQL_SECRET_PATH` | Secret Manager path | string | `projects/.../secrets/.../versions/latest` |
| `CLOUD_SQL_AUTO_IAM_AUTHN` | Enable IAM authentication | boolean | `true` or `1` |
| `CLOUD_SQL_FORMAT` | Output format | string | `json` or `text` |
| `CLOUD_SQL_LIMIT` | Maximum rows to return | number | `100` |
| `CLOUD_SQL_VERBOSE` | Enable verbose logging | boolean | `true` or `1` |

**Note:** Command line arguments take precedence over environment variables.

## Executable Usage

### Global Installation
```bash
cloud-sql-execute -p PROJECT_ID -i INSTANCE_ID "SELECT 1"
```

### Development Mode
```bash
chmod +x index.ts
./index.ts -p PROJECT_ID -i INSTANCE_ID "SELECT 1"
```

## About the API

This tool uses Google Cloud SQL Admin API's `sql.instances.executeSql` method.
This API is used internally by Cloud SQL Studio but currently has no official documentation.

## Example Execution

```bash
$ bunx cloud-sql-execute -p my-project -i my-instance -d postgres -u myuser --password mypass "SELECT 1 as one, 'Hello' as greeting"
one	greeting
------------
1	Hello
```

## Project ID Auto-Detection

When project ID is not specified, the tool attempts auto-detection in this order:

1. From Google Cloud Application Default Credentials
2. From `GOOGLE_CLOUD_PROJECT` environment variable
3. From gcloud configuration files

If auto-detection fails, explicitly specify the project ID with `-p/--project` option.

## Log Level Control

This CLI tool supports two log levels:

### Normal Mode (Default)
- Shows query results only
- Shows error messages only
- Suppresses unnecessary information, optimal for script usage

```bash
$ bunx cloud-sql-execute -i my-instance -d my-db --auto-iam-authn "SELECT 1"
?column?
--------
1
```

### Verbose Mode (`-v/--verbose`)
- Shows project ID detection process
- Shows execution progress
- Shows request/response details (debug level)
- Shows execution time and affected rows

```bash
$ bunx cloud-sql-execute -i my-instance -d my-db --auto-iam-authn -v "SELECT 1"
[07:21:28] INFO: No project specified, attempting to detect default project...
[07:21:28] INFO: Using detected project: my-project
[07:21:28] INFO: Executing SQL on my-project/my-instance...
?column?
--------
1
[07:21:29] INFO: Execution time: 0.000832622s
```

## Authentication Methods

This CLI tool supports 3 working authentication methods:

### 1. Database User Authentication
```bash
# Auto-detect project ID
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME -u USERNAME --password PASSWORD "SELECT 1"

# Explicit project ID
bunx cloud-sql-execute -p PROJECT_ID -i INSTANCE_ID -d DATABASE_NAME -u USERNAME --password PASSWORD "SELECT 1"
```

### 2. IAM Authentication (Auto)
```bash
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME --auto-iam-authn "SELECT 1"
```

### 3. IAM Access Token
```bash
bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME --access-token $(gcloud auth print-access-token) "SELECT 1"
```

### ~~4. Secret Manager Authentication~~ (Currently Not Supported)
```bash
# This method is currently not working (as of January 27, 2025)
# bunx cloud-sql-execute -i INSTANCE_ID -d DATABASE_NAME -u USERNAME --secret-path projects/PROJECT_ID/secrets/db-password/versions/latest "SELECT 1"
```

## Important Notes

- **database**: The database parameter is required for this API
- **Authentication methods**: Cannot specify multiple authentication methods simultaneously
- **JSON format**: JSON output format (-f json) now works correctly
- **IAM authentication**: When using `--auto-iam-authn`, the API caller must be an IAM user in the database
- **Secret Manager authentication**: As of January 27, 2025, Secret Manager authentication (`--secret-path`) is not supported by the Cloud SQL Admin API ExecuteSql method, despite being defined in the API specification. The API returns "Credential for the user cannot be empty" error when attempting to use Secret Manager paths.

## Technical Specifications

- **Runtime**: Bun 1.2+
- **Language**: TypeScript
- **CLI Framework**: Commander.js v12
- **Authentication**: Google Cloud Application Default Credentials
- **API**: Google Cloud SQL Admin API v1beta4 ExecuteSql method

## Requirements

- Bun 1.2+
- Google Cloud SDK (for authentication)
- Access permissions to Cloud SQL Admin

## Installation Methods

```bash
# Global installation from npm
npm install -g cloud-sql-execute

# Or use directly with bunx/npx
bunx cloud-sql-execute [options] "<query>"
npx cloud-sql-execute [options] "<query>"

# Development installation
git clone https://github.com/k2wanko/cloud-sql-execute.git
cd cloud-sql-execute
bun install
bun run index.ts [options] "<query>"
```
