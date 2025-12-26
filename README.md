# Leak Monitor

AI-powered ransomware victim tracking and threat intelligence platform.

## Overview

Leak Monitor is a self-hosted web application that tracks ransomware victim postings from [RansomLook.io](https://www.ransomlook.io) and uses AI to automatically classify companies, search for news coverage, and correlate with SEC 8-K cybersecurity disclosures.

**Key Features:**
- Monitor ransomware leak sites for new victim postings
- AI-powered company classification and enrichment
- Automated news search for breach coverage
- SEC 8-K filing correlation for public companies
- Excel export for analysis and reporting
- Single `docker compose up` deployment

## Architecture

- **Backend:** FastAPI + Python 3.12
- **Database:** PostgreSQL 16
- **AI:** Anthropic Claude (user-provided API key)
- **Data Source:** [RansomLook.io](https://www.ransomlook.io) (CC BY 4.0)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- (Optional) Anthropic API key for AI features

### Deployment

1. Clone the repository:
```bash
git clone https://github.com/jmbl2021/leak-monitor.git
cd leak-monitor
```

2. Create environment file:
```bash
cp .env.example .env
# Edit .env and set a secure DB_PASSWORD
```

3. Start the stack:
```bash
docker compose up -d
```

4. Access the application:
```bash
# Web UI
open http://localhost:3000

# Backend API
curl http://localhost:8001/api/health

# API documentation
open http://localhost:8001/docs
```

5. **Configure API Key (for AI features):**
   - Navigate to http://localhost:3000/settings
   - Enter your Anthropic API key from https://console.anthropic.com/
   - Click "Save API Key" and "Test API Key"
   - Key is stored locally in your browser

## API Endpoints

### Core Endpoints
- `GET /api/health` - System health check
- `GET /api/victims` - List victims with filtering
- `GET /api/victims/{id}` - Get single victim
- `PUT /api/victims/{id}` - Update victim classification
- `GET /api/monitors` - List monitoring tasks
- `POST /api/monitors` - Create new monitor
- `GET /api/groups` - List available ransomware groups

### AI-Powered Endpoints (Phase 3)
- `POST /api/analyze/classify` - AI classify victims
- `POST /api/analyze/news/{id}` - Search news coverage
- `POST /api/analyze/8k/{id}` - Check SEC 8-K filing

## Configuration

### Environment Variables

See `.env.example` for all configuration options.

**Required:**
- `DB_PASSWORD` - PostgreSQL password

**Optional:**
- `LOG_LEVEL` - Logging level (default: INFO)
- `FRONTEND_URL` - Frontend URL (default: http://localhost:3000)
- `CORS_ORIGINS` - Comma-separated allowed origins (default: http://localhost:3000)
- `ANTHROPIC_API_KEY` - Server-side AI key (users can also provide via UI)

### API Key Management

The Anthropic API key can be provided in two ways:

1. **Via UI (Recommended):** Users enter their key in the frontend, stored in browser localStorage
2. **Via Environment:** Set `ANTHROPIC_API_KEY` for server-side key

Keys are never stored in the database.

## Development

### Project Structure

```
leak-monitor/
├── backend/               # FastAPI backend
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Database & config
│   │   ├── models/       # Data models
│   │   └── services/     # Business logic
│   ├── Dockerfile
│   └── requirements.txt
├── db/                   # Database initialization
│   └── init.sql
├── frontend/             # React frontend (Phase 4)
├── docker-compose.yml
└── README.md
```

### Running in Development

```bash
# Backend only
docker compose up -d db
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Full stack
docker compose -f docker-compose.dev.yml up
```

## Data Attribution

This project uses data from [RansomLook.io](https://www.ransomlook.io), provided under the [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license. Attribution is automatically included in all exports.

## Implementation Status

- [x] **Phase 1:** Backend scaffold & Docker setup
- [x] **Phase 2:** Core API endpoints (victims, monitors)
- [x] **Phase 3:** AI classification pipeline
- [x] **Phase 4:** React frontend with Settings page
- [x] **Testing:** Comprehensive test suite (21 tests, 100% pass rate)

## Future Enhancements

- [ ] Real-time notifications for new victims
- [ ] Multi-user authentication and access control
- [ ] Advanced analytics and trending
- [ ] Automated weekly/monthly reports
- [ ] Integration with SIEM platforms
- [ ] Historical trend analysis

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Network Configuration

### Access URLs

- **Web UI:** http://localhost:3000
- **Backend API:** http://localhost:8001/api
- **API Docs:** http://localhost:8001/docs

### Custom Domain (Optional)

To access via a custom domain:

1. Configure DNS to point your domain to your server
2. Set up a reverse proxy (nginx, Caddy, Traefik, etc.):
   - Frontend: proxy to `localhost:3000`
   - Backend API: proxy `/api` to `localhost:8001`
3. Add your domain to `CORS_ORIGINS` in `.env`:
   ```env
   CORS_ORIGINS=http://localhost:3000,https://your-domain.example.com
   ```
4. Rebuild the backend: `docker compose up -d --build backend`

### CORS Configuration

CORS origins are configured via the `CORS_ORIGINS` environment variable.
Default allows only `http://localhost:3000`.

## Security

This is a self-hosted application. Ensure you:
- Use strong database passwords
- Secure your Anthropic API keys
- Run behind a reverse proxy with HTTPS in production
- Keep dependencies updated

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.

## Support

- **Issues:** [GitHub Issues](https://github.com/jmbl2021/leak-monitor/issues)
- **Documentation:** See `/docs` directory
- **RansomLook API:** https://www.ransomlook.io/api

---

**Note:** This project is for threat intelligence and research purposes. All data comes from publicly available ransomware leak sites via RansomLook.io.
