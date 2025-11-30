# Django PDF RAG Chat System

A production-ready real-time chat application that enables users to upload PDF documents and interact with their content through AI-powered Retrieval-Augmented Generation (RAG). Built with Django, WebSockets, and OpenAI integration.

## 🏗️ Overall Approach and Architecture

### System Architecture

```
┌─────────────────┐    JWT Auth    ┌─────────────────┐    Embeddings    ┌─────────────────┐
│   Client App    │◄──────────────►│  Django REST    │◄─────────────────►│   ChromaDB      │
│   (Frontend)    │   WebSocket    │     API         │   Vector Search   │ Vector Database │
└─────────────────┘                └─────────────────┘                   └─────────────────┘
                                            │
                                            │ Streaming API
                                            ▼
                                   ┌─────────────────┐
                                   │   OpenAI GPT    │
                                   │   API Service   │
                                   └─────────────────┘
```

### Core Design Principles

**1. Modular Architecture**

- Separated Django apps for authentication (`account`) and RAG functionality (`rag`)
- Environment-specific settings structure (`base.py`, `dev.py`, `prod.py`)
- Modular requirements organization for different deployment environments

**2. Real-time Communication**

- Django Channels with WebSocket support for bidirectional communication
- JWT authentication middleware for WebSocket connections
- Streaming responses for enhanced user experience

**3. RAG Implementation**

- ChromaDB vector database for efficient semantic search
- OpenAI embeddings for document vectorization
- Chunked document processing for optimal retrieval
- Context-aware response generation

**4. Production-Ready Features**

- Environment-based configuration management
- Comprehensive error handling and logging
- File upload validation and security
- Static file serving with WhiteNoise

### Technical Stack

| Component             | Technology            | Version | Purpose                       |
| --------------------- | --------------------- | ------- | ----------------------------- |
| **Backend Framework** | Django                | 5.2.6   | Core web framework            |
| **API Framework**     | Django REST Framework | 3.16.1  | RESTful API development       |
| **WebSocket Support** | Django Channels       | 4.3.1   | Real-time communication       |
| **Authentication**    | SimpleJWT             | 5.5.1   | JWT token management          |
| **Vector Database**   | ChromaDB              | 1.1.0   | Document embeddings storage   |
| **AI Integration**    | OpenAI API            | 0.26.5  | Language model and embeddings |
| **PDF Processing**    | PyPDF2                | 3.0.1   | Document text extraction      |
| **ASGI Server**       | Daphne                | 4.2.1   | Production WebSocket server   |

## 🚀 Local Development Setup

### Prerequisites

- **Python**: 3.8+ (Tested with 3.12)
- **Virtual Environment**: venv or virtualenv
- **OpenAI API Key**: Required for embeddings and chat completion
- **Git**: For repository cloning

### Installation Steps

#### 1. Repository Setup

```bash
git clone https://github.com/ahmed14527/RAG-MINI

```

#### 2. Virtual Environment

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate     # Windows
```

#### 3. Dependencies Installation

```bash
# Development environment (recommended for local development)
pip install -r requirements/dev.txt

# Production environment
pip install -r requirements/prod.txt

# Base dependencies only
pip install -r requirements/base.txt
```

#### 4. Environment Configuration

```bash
cp .env.example .env
```

**Configure `.env` file:**

```bash
# Django Settings Module (controls which environment settings to use)
DJANGO_SETTINGS_MODULE=project.settings.dev

# Core Django Settings
DEBUG=True
SECRET_KEY=your-development-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0

# OpenAI Configuration (REQUIRED)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### 5. Database Migration

```bash
python manage.py migrate
python manage.py createsuperuser  # Optional: for admin access
```

#### 6. Development Server

```bash
# Start development server (includes static file serving)
python manage.py runserver

# Alternative: Production-like server
daphne project.asgi:application --port 8000
```

**Server Access:**

- API: `http://127.0.0.1:8000/`
- Admin: `http://127.0.0.1:8000/admin/`
- WebSocket: `ws://127.0.0.1:8000/api/v1/ws/chat/`

## 📄 Project Structure

```
django-pdf-rag-chat/
├── project/settings/          # Environment-specific Django settings
├── account/                   # User authentication app
├── rag/                       # RAG functionality and WebSocket consumers
├── requirements/              # Environment-specific dependencies
├── media/                     # User uploaded files
├── staticfiles/              # Collected static files
├── chroma_db/                # Vector database storage
└── README.md                 # This documentation
```

## 📖 Complete API Documentation

### � Interactive API Documentation

**[View Complete Postman API Documentation](https://documenter.getpostman.com/view/33316118/2sB3QFSCqa)**

The comprehensive API documentation includes:

- **Authentication Endpoints**: Registration, login, token refresh
- **File Upload Endpoints**: PDF upload and document management
- **Request/Response Examples**: Complete with sample data
- **Error Handling**: Detailed error responses and codes

#### 🔌 WebSocket API Documentation

While Postman covers REST APIs, the WebSocket API requires a manual guide.

- **WebSocket Connection**: Real-time chat integration

#### 📍 Connection

```bash
ws://127.0.0.1:8000/api/v1/ws/chat/?token=<access_token>
```

- **Protocol**: WebSocket
- **Authentication**: JWT access_token passed as a query parameter

- 📤 **Sending Messages**:

```{
  "query": "What programming languages does ahmed know?"
}
```

## 🔐 Authentication System Usage

### JWT Authentication Flow

The API uses JWT (JSON Web Token) based authentication with access and refresh tokens. All endpoints require proper authentication except for registration and login.

### Key Authentication Endpoints

| Endpoint                         | Method | Purpose              | Authentication Required |
| -------------------------------- | ------ | -------------------- | ----------------------- |
| `/api/v1/account/register/`      | POST   | User registration    | No                      |
| `/api/v1/account/login/`         | POST   | User login           | No                      |
| `/api/v1/account/token/refresh/` | POST   | Refresh access token | No                      |

### Using Authentication Tokens

Include the access token in the Authorization header for all protected endpoints:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### JWT Token Configuration

The application uses optimized token lifetimes for better user experience:

| Token Type        | Lifetime   | Purpose                                     |
| ----------------- | ---------- | ------------------------------------------- |
| **Access Token**  | 30 minutes | API authentication for protected endpoints  |
| **Refresh Token** | 7 days     | Generate new access tokens without re-login |

**Token Management:**

- Access tokens expire after 30 minutes for security
- Use the refresh token to get new access tokens
- Refresh tokens are valid for 7 days
- Last login time is automatically tracked

## 📄 PDF Upload & RAG Endpoints

### Available Endpoints

| Endpoint              | Method | Purpose             | Response Format         |
| --------------------- | ------ | ------------------- | ----------------------- |
| `/api/v1/rag/upload/` | POST   | Upload PDF document | JSON with document info |

### Upload Constraints

- **Supported formats**: PDF only
- **Authentication**: JWT token required
- **Processing**: Automatic text extraction and vectorization

## 💬 WebSocket Chat Integration

### Connection Establishment

**WebSocket URL:**

```
ws://127.0.0.1:8000/api/v1/ws/chat/?token=your-jwt-access-token
```

### Testing with Tools

#### Postman WebSocket

1. Enable WebSocket in Postman
2. Connect to: `ws://127.0.0.1:8000/api/v1/ws/chat/?token=your-token`
3. Send: `{ "query": "What programming languages does ahmed know?" }`
4. Observe streaming responses

## 🔧 Dependencies and Environment Variables

### Requirements Structure

```
requirements/
├── base.txt      # Core dependencies (Django, OpenAI, ChromaDB)
├── dev.txt       # Development tools (inherits from base.txt)
└── prod.txt      # Production packages (inherits from base.txt)
```

### Environment Variables Reference

| Variable                 | Type       | Required | Default                | Description                                 |
| ------------------------ | ---------- | -------- | ---------------------- | ------------------------------------------- |
| `DJANGO_SETTINGS_MODULE` | String     | No       | `project.settings.dev` | Django settings module to load              |
| `DEBUG`                  | Boolean    | No       | `True`                 | Enable Django debug mode                    |
| `SECRET_KEY`             | String     | Yes      | Auto-generated         | Django secret key for cryptographic signing |
| `OPENAI_API_KEY`         | String     | **Yes**  | None                   | OpenAI API key for embeddings and chat      |
| `ALLOWED_HOSTS`          | CSV String | No       | `localhost,127.0.0.1`  | Allowed hostnames for Django                |

### Settings Architecture

The project uses a modular settings approach:

```
project/settings/
├── base.py      # Shared settings across all environments
├── dev.py       # Development-specific settings
└── prod.py      # Production-specific settings
```

**Key Features:**

- Environment variable-driven configuration
- Automatic dotenv loading in all entry points
- Production security settings
- Media file handling with proper permissions
- Comprehensive logging configuration

### API Endpoint Summary

| Category                | Endpoint                         | Method    | Description          |
| ----------------------- | -------------------------------- | --------- | -------------------- |
| **Authentication**      | `/api/v1/account/register/`      | POST      | User registration    |
| **Authentication**      | `/api/v1/account/login/`         | POST      | User login           |
| **Authentication**      | `/api/v1/account/token/refresh/` | POST      | Refresh access token |
| **Document Management** | `/api/v1/rag/upload/`            | POST      | Upload PDF document  |
| **Real-time Chat**      | `/api/v1/ws/chat/`               | WebSocket | Interactive PDF chat |

---
