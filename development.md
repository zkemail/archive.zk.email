# Development

For general guidelines on contributing to the projects under ZK Email, see the [Contributing](https://docs.zk.email/contributing) page for ZK Email.

## Local development setup

### Prerequisites

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (install with `npm install --global pnpm`)
- A [PostgreSQL](https://www.postgresql.org/) database

### Installation

Install dependencies

```bash
pip3 install prisma
prisma generate
pnpm install
```

Copy `.env.example` to `.env`

Edit `.env` and configure `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` to point to your PostgreSQL database. See [below](#setting-up-a-postgresql-database-on-ubuntu) for an example setup of PostgreSQL on Ubuntu.

Initialize the database

```bash
pnpm prisma migrate dev
```

Start the development server

```bash
pnpm dev
```

Navigate to http://localhost:3000 in your browser. If everything is set up correctly, you should see the DKIM Archive website and be able to search for any of the domains created by the seed script, for example `example.com`.

### Setting up a PostgreSQL database on Ubuntu

Install PostgreSQL server and client with `sudo apt install postgresql`

Log in with `sudo -u postgres psql` and set a password with `\password postgres`

Test the login: `psql postgresql://postgres:YOURPASSWORD@localhost`

Update your `.env` file:

```
POSTGRES_URL_NON_POOLING="postgresql://postgres:YOURPASSWORD@localhost/dkim_lookup"
POSTGRES_PRISMA_URL="postgresql://postgres:YOURPASSWORD@localhost/dkim_lookup"
```

## Database management

To manage the database via Prisma, run `pnpm prisma` followed by the Prisma command. For example `pnpm prisma migrate status`. See the [Prisma CLI reference](https://www.prisma.io/docs/orm/reference/prisma-cli-reference) for the full list of commands.

## Unit tests

Run the unit tests

```bash
pnpm vitest --run
```
