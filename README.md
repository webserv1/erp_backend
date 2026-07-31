# ERP backend authentication

## Setup

1. Copy the values in `.env.example` into `.env` and set a different, random value for `JWT_SECRET` and `SESSION_SECRET`.
2. Apply the Prisma migration: `npm run prisma:migrate -- --name your_change_name`.
3. Start the API with `npm run dev`.

The initial public registration endpoint creates a new company and its first `ADMIN`. Only an authenticated `ADMIN` can create `MANAGER` and `WORKER` users in that company.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create a company and its first Admin |
| POST | `/api/auth/login` | Log in with email and password |
| GET | `/api/auth/me` | Get the currently authenticated user |
| POST | `/api/auth/users` | Admin-only: create a Manager or Worker |
| POST | `/api/auth/logout` | End the server session |

`register` and `users` accept `multipart/form-data`. Use `name`, `dob`, `mobile`, `email`, `gender`, `address`, `password`, and `confirmPassword`, plus image files named `photo`, `signature`, `pan`, and `aadhaar`. Registration also requires `companyName`; Admin user creation requires `role` (`MANAGER` or `WORKER`).

Send the login access token on protected requests as `Authorization: Bearer <token>`. The API also creates an HTTP-only PostgreSQL-backed session cookie on login.
