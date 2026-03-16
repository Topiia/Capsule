#!/usr/bin/env bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default URLs (override with env vars)
BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
FRONTEND_URL="${FRONTEND_URL:-https://vlogspherefrontend.vercel.app}"
DATE=$(date +%Y%m%d-%H%M%S)

# Expects a local 'cookies.txt' file for admin authentication

show_help() {
    echo "Usage: ./manage-csp.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  status         Show current CSP violations"
    echo "  report         Download violations to JSON file"
    echo "  test           Test CSP headers on backend + frontend"
    echo "  verify-vercel  Check Vercel deployment headers"
    echo "  dashboard      Print/Open the CSP dashboard URL"
    echo "  auth           Instructions for CLI admin authentication"
    echo "  help           Show this help"
}

case "$1" in
    status)
        echo -e "${YELLOW}📊 CSP Violation Status${NC}"
        echo "Querying: $BACKEND_URL/api/csp-stats (requires cookies.txt)"
        echo ""
        
        # Try different JSON pretty-print methods
        curl -sb cookies.txt -sf "$BACKEND_URL/api/csp-stats" 2>/dev/null | python3 -m json.tool 2>/dev/null || \
        curl -sb cookies.txt -sf "$BACKEND_URL/api/csp-stats" 2>/dev/null | jq '.' 2>/dev/null || \
        curl -sb cookies.txt -sf "$BACKEND_URL/api/csp-stats" || \
        echo -e "${RED}❌ Failed to fetch. Did you generate cookies.txt via 'auth'?${NC}"
        ;;
        
    report)
        echo -e "${YELLOW}📝 Generating CSP Report${NC}"
        OUTPUT="csp-report-$DATE.json"
        curl -sb cookies.txt -sf "$BACKEND_URL/api/csp-stats" > "$OUTPUT" 2>/dev/null
        
        if [ -s "$OUTPUT" ]; then
            echo -e "${GREEN}✅ Report saved to $OUTPUT${NC}"
        else
            echo -e "${RED}❌ Failed to generate report. Missing cookies.txt?${NC}"
            rm -f "$OUTPUT"
        fi
        ;;
        
    dashboard)
        URL="$BACKEND_URL/api/csp-dashboard"
        echo -e "${YELLOW}🌐 Opening: $URL${NC}"
        # Automatically open in OS default browser if possible
        if command -v open > /dev/null; then
            open "$URL"
        elif command -v xdg-open > /dev/null; then
            xdg-open "$URL"
        elif command -v start > /dev/null; then
            start "$URL"
        fi
        ;;
        
    auth)
        echo -e "${YELLOW}🔑 CLI Authentication Instructions${NC}"
        echo -e "Since the API uses existing admin session cookies, you must log in first:"
        echo -e ""
        echo -e "1. Create a ${BLUE}cookies.txt${NC} file by logging in via cURL:"
        echo -e "   curl -c cookies.txt -X POST -H \"Content-Type: application/json\" \\"
        echo -e "        -d '{\"email\":\"admin@example.com\",\"password\":\"yourpass\"}' \\"
        echo -e "        $BACKEND_URL/api/v1/users/login"
        echo -e ""
        echo -e "2. Run ${BLUE}./manage-csp.sh status${NC} (it will automatically use cookies.txt)"
        ;;
        
    test)
        echo -e "${YELLOW}🔍 Testing CSP Headers${NC}"
        echo ""
        
        echo -e "${BLUE}Backend ($BACKEND_URL):${NC}"
        curl -sI "$BACKEND_URL/health" | grep -i "content-security-policy" || \
            echo -e "${RED}❌ CSP headers not found on backend${NC}"
        echo ""
        
        echo -e "${BLUE}Frontend ($FRONTEND_URL):${NC}"
        curl -sI "$FRONTEND_URL" | grep -i "content-security-policy" || \
            echo -e "${YELLOW}⚠️  CSP headers not found on frontend (may be normal)${NC}"
        ;;
        
    verify-vercel)
        echo -e "${YELLOW}🔍 Verifying Vercel Headers${NC}"
        curl -sI "$FRONTEND_URL" | grep -E "Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options" || \
            echo -e "${RED}❌ Security headers missing${NC}"
        ;;
        
    help|--help|-h)
        show_help
        ;;
        
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac
