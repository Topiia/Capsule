#!/bin/bash
# manage-csp.sh — CLI tool for CSP violation monitoring on Capsule.
#
# Usage:  ./backend/scripts/manage-csp.sh [COMMAND]
# Requires: curl (always), python3 or jq (optional, for pretty-printing)

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No colour

# ── Base URL: override with RENDER_URL env var in production ─────────────────
BASE_URL=${RENDER_URL:-"http://localhost:5000"}

# ── Helpers ──────────────────────────────────────────────────────────────────

pretty_json() {
  # Try python3 first (usually available on macOS/Linux), then jq, then raw
  python3 -m json.tool 2>/dev/null || jq '.' 2>/dev/null || cat
}

show_help() {
  echo ""
  echo "  Usage: ./backend/scripts/manage-csp.sh [COMMAND]"
  echo ""
  echo "  Commands:"
  echo "    status     Show current violations from /api/csp-stats (admin token required)"
  echo "    test       Check CSP headers are present on backend"
  echo "    report     Download violation data as a local JSON report file"
  echo "    dashboard  Print the dashboard URL (or open it if possible)"
  echo "    clear      Print instructions for clearing violations"
  echo "    help       Show this help text"
  echo ""
  echo "  Environment:"
  echo "    RENDER_URL  Override base URL  (default: http://localhost:5000)"
  echo "    ADMIN_TOKEN Set Bearer token   (required for status endpoint)"
  echo ""
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd_status() {
  echo -e "${YELLOW}📊 CSP Violation Status${NC}"
  echo -e "   Target: ${BLUE}${BASE_URL}/api/csp-stats${NC}"

  if [ -n "$ADMIN_TOKEN" ]; then
    curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "${BASE_URL}/api/csp-stats" | pretty_json
  else
    echo -e "${RED}⚠️  ADMIN_TOKEN not set — the /api/csp-stats endpoint requires admin auth.${NC}"
    echo "   Export your token: export ADMIN_TOKEN=<your-jwt>"
    echo ""
    echo "   Attempting unauthenticated request (will likely return 401)..."
    curl -s "${BASE_URL}/api/csp-stats" | pretty_json
  fi
}

cmd_test() {
  echo -e "${YELLOW}🔍 Testing CSP Headers${NC}"

  echo ""
  echo -e "${BLUE}Backend (${BASE_URL}/health):${NC}"
  BACKEND_HEADERS=$(curl -sI "${BASE_URL}/health" 2>/dev/null)
  if echo "$BACKEND_HEADERS" | grep -qi "content-security-policy"; then
    echo -e "   ${GREEN}✅ Content-Security-Policy header present${NC}"
  else
    echo -e "   ${RED}❌ Content-Security-Policy header NOT found${NC}"
  fi

  echo ""
  echo -e "${BLUE}Frontend (https://vlogspherefrontend.vercel.app):${NC}"
  FRONTEND_HEADERS=$(curl -sI "https://vlogspherefrontend.vercel.app" 2>/dev/null)
  if echo "$FRONTEND_HEADERS" | grep -qi "content-security-policy"; then
    echo -e "   ${GREEN}✅ Content-Security-Policy header present${NC}"
  else
    echo -e "   ${YELLOW}⚠️  Content-Security-Policy header not found (may be set via Vercel meta-tags)${NC}"
  fi
}

cmd_report() {
  FILENAME="csp-report-$(date +%Y%m%d-%H%M%S).json"
  echo -e "${YELLOW}📝 Generating CSP Report${NC}"

  if [ -n "$ADMIN_TOKEN" ]; then
    curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "${BASE_URL}/api/csp-stats" > "$FILENAME"
  else
    curl -s "${BASE_URL}/api/csp-stats" > "$FILENAME"
  fi

  echo -e "${GREEN}✅ Report saved to: ${FILENAME}${NC}"
  echo "   Preview:"
  head -c 500 "$FILENAME" | pretty_json || true
}

cmd_dashboard() {
  URL="${BASE_URL}/api/csp-dashboard"
  echo -e "${YELLOW}🌐 CSP Dashboard${NC}"
  echo -e "   URL: ${BLUE}${URL}${NC}"
  echo "   Note: Requires admin JWT cookie in your browser session."
  echo ""

  # Try platform-specific openers
  if command -v xdg-open > /dev/null 2>&1; then
    xdg-open "$URL"
  elif command -v open > /dev/null 2>&1; then
    open "$URL"
  else
    echo "   Please open the URL manually in your browser."
  fi
}

cmd_clear() {
  echo -e "${RED}⚠️  Violation data is stored in-memory.${NC}"
  echo ""
  echo "   To clear it, restart the backend process:"
  echo "     • Render:  Trigger a manual redeploy in the Render dashboard."
  echo "     • Local:   Restart 'npm run dev'."
  echo "     • PM2:     pm2 restart capsule-backend"
  echo ""
  echo "   (For persistent storage, migrate violationStore to Redis or MongoDB.)"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────

case "$1" in
  status)   cmd_status   ;;
  test)     cmd_test     ;;
  report)   cmd_report   ;;
  dashboard) cmd_dashboard ;;
  clear)    cmd_clear    ;;
  help|--help|-h|"") show_help ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    show_help
    exit 1
    ;;
esac
