# Basic Real-Time Collaborative Code Editor

Author: Manikant Mishra

## Live Demo

https://co-e0907d69ad4e41bab63a399b412dc4bd.ecs.ap-south-1.on.aws

A lightweight collaborative web application for editing code in real time with a React frontend and a Node.js backend. The project is designed to run locally and can also be deployed using Docker and AWS ECS.

## Overview

This application combines:

- a React + Vite frontend
- a Node.js + Express backend
- Socket.IO for real-time communication
- Yjs and y-socket.io for collaborative editing
- Docker-based deployment support
- AWS ECS and Fargate hosting compatibility

## Features

- Real-time multi-user code collaboration
- Shared editing experience through synchronized document state
- Frontend served from a production build
- Backend health endpoint for deployment checks
- Containerized deployment workflow for AWS

## Tech Stack

| Layer            | Technology          |
| ---------------- | ------------------- |
| Frontend         | React, Vite         |
| Code Editor      | Monaco Editor       |
| Backend          | Node.js, Express.js |
| Real-time Sync   | Socket.IO           |
| Collaboration    | Yjs, y-socket.io    |
| Containerization | Docker              |
| Cloud Platform   | AWS ECS, Fargate    |
| Monitoring       | Amazon CloudWatch   |
| HTTPS            | AWS ALB / ACM       |

## Project Structure

```text
project-root/
├── dockerfile
├── readme.md
├── Frontend/
│   ├── package.json
│   ├── src/
│   └── public/
├── Backend/
│   ├── server.js
│   ├── package.json
│   └── public/
├── .gitignore
├── .dockerignore
└── aws-setup.pdf
```

## How It Works

1. The frontend is built with Vite.
2. The production build is copied into the backend public folder.
3. Express serves the frontend files.
4. Socket.IO attaches to the HTTP server for live communication.
5. Yjs and y-socket.io synchronize collaborative state across clients.
6. Docker packages the app for deployment.
7. The container is deployed to AWS ECS with Fargate.

## Health Endpoint

The backend exposes a health route:

```http
GET /health
```

Example response:

```json
{
  "message": "ok",
  "success": true
}
```

## Browser Execution and Preview

- JavaScript files run in a disposable Web Worker in the current browser. The
  worker captures console output, supports async/await, and is terminated after
  five seconds or when Stop is pressed. `Ctrl+Enter` runs the active supported
  file. Results remain local to the user who ran the code and are not written
  to the shared Yjs document.
- HTML files render in a sandboxed iframe with an opaque origin. The preview
  allows scripts and forms, but does not grant same-origin access, popups,
  downloads, or top-level navigation. A heartbeat watchdog removes a preview
  that stops responding.
- Relative linked CSS and classic JavaScript files are resolved from the
  shared workspace folder tree. Local text SVGs and data-image URIs are
  supported. Binary workspace assets, JavaScript module imports, and external
  JavaScript are not bundled; unsupported references are reported in Console.
  HTTPS styles and images may load, but preview network connections and form
  submissions are blocked by policy.
- The Worker hides common network and storage APIs, but browser Workers and
  sandboxed frames are not complete security boundaries. They cannot guarantee
  protection from every browser resource-exhaustion attack. Do not treat this
  feature as a secure service for executing hostile code.

Run the frontend unit tests from `Frontend/`:

```bash
npm test
npm run lint
npm run build
```

## Run Locally

### Prerequisites

- Node.js and npm
- Docker Desktop
- Project source code

### Backend

From the backend folder:

```bash
npm install
npm start
```

### Build Docker Image

From the project root:

```bash
docker build -t collab-editor:latest .
```

### Run the Container

```bash
docker run -d --name collab-editor-test -p 8080:80 collab-editor:latest
```

Then open:

- http://localhost:8080
- http://localhost:8080/health

## Dockerfile Overview

The project uses a multi-stage Docker build:

```dockerfile
# Build the Frontend
FROM node:20-alpine AS frontend-builder

COPY ./Frontend /app
WORKDIR /app

RUN npm install
RUN npm run build

# Build the Backend
FROM node:20-alpine

COPY ./Backend /app
WORKDIR /app

RUN npm install

COPY --from=frontend-builder /app/dist /app/public

EXPOSE 80

CMD ["node", "server.js"]
```

## Backend Configuration

The backend is configured to listen on port 80 in the container environment:

```js
const PORT = process.env.PORT || 80;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
```

This aligns the app with the ECS target group and container configuration.

## AWS Deployment Notes

The project was configured for deployment on AWS using Docker, Amazon ECR, and AWS ECS Express Mode. The deployment flow includes:

- image build
- ECR push
- ECS task definition update
- service deployment on Fargate
- target group health validation

## Security Checklist

- Restrict Socket.IO CORS origins to trusted frontend domains.
- Validate authentication and authorization for collaboration rooms.
- Keep production secrets out of source control.
- Use a secret manager for environment-specific values.
- Confirm WebSocket connectivity through the load balancer and health checks.

## License

This project is currently intended for internal or educational use unless otherwise specified in a separate project license.

## Contact

Manikant Mishra
