# Validation and release evidence

Run `npm run check` for strict TypeScript compilation plus named unit, integration, end-to-end and security tests. Run `npm run test:package` to build a tarball, install it into a temporary clean project with scripts disabled, load the public package exports and invoke the installed CLI. Tests use synthetic local fixtures, never customer data or hosted endpoints.

CI targets Node 22/24 on Linux/macOS with Python 3.10 or newer; only completed jobs verify those platforms. Windows file operations fail closed. Local candidate validation is separate from anonymous public installation, registry ownership, protected release settings and independent security/QA review. Missing evidence remains unverified.
