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

show_help() {
    echo "Usage: ./manage-csp.sh [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  status         Show current CSP violations"
    echo "  report         Download violations to JSON file"
    echo "  test           Test CSP headers on backend + frontend"
    echo "  verify-vercel  Check Vercel deployment headers"
    echo "  help           Show this help"
}

case "$1" in
    status)
        echo -e "${YELLOW}📊 CSP Violation Status${NC}"
        echo "Querying: $BACKEND_URL/api/csp-stats"
        echo ""
        
        # Try different JSON pretty-print methods
        curl -sf "$BACKEND_URL/api/csp-stats" 2>/dev/null | python3 -m json.tool 2>/dev/null || \
        curl -sf "$BACKEND_URL/api/csp-stats" 2>/dev/null | jq '.' 2>/dev/null || \
        curl -sf "$BACKEND_URL/api/csp-stats" || \
        echo -e "${RED}❌ Could not connect to $BACKEND_URL/api/csp-stats${NC}"
        ;;
        
    report)
        echo -e "${YELLOW}📝 Generating CSP Report${NC}"
        OUTPUT="csp-report-$DATE.json"
        curl -sf "$BACKEND_URL/api/csp-stats" > "$OUTPUT" 2>/dev/null
        
        if [ -s "$OUTPUT" ]; then
            echo -e "${GREEN}✅ Report saved to $OUTPUT${NC}"
        else
            echo -e "${RED}❌ Failed to generate report${NC}"
            rm -f "$OUTPUT"
        fi
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
