package middleware

import (
	"net/http"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// Permission constants — stored comma-separated in users.permissions column.
const (
	PermInboundsRead  = "inbounds.read"
	PermInboundsWrite = "inbounds.write"
	PermClientsRead   = "clients.read"
	PermClientsWrite  = "clients.write"
	PermSettingsWrite = "settings.write"
	PermRoutesRead    = "routes.read"
)

// routePermissions maps relative route patterns (after /panel/api) to the
// permission required to call them.  Patterns use the same wildcard syntax
// as Gin so the match can be done with simple string operations; we keep
// the table sorted by specificity — first match wins.
//
// A route NOT listed here is unrestricted for any logged-in session user
// (e.g. server status, read-only dashboard data that every role sees).
var routePermissions = []routePerm{
	// ── inbounds ─────────────────────────────────────────────────────────
	{prefix: "/inbounds", method: http.MethodGet, perm: PermInboundsRead},
	{prefix: "/inbounds/add", method: http.MethodPost, perm: PermInboundsWrite},
	{prefix: "/inbounds/del/", method: http.MethodPost, perm: PermInboundsWrite},
	{prefix: "/inbounds/bulkDel", method: http.MethodPost, perm: PermInboundsWrite},
	{prefix: "/inbounds/update/", method: http.MethodPost, perm: PermInboundsWrite},
	{prefix: "/inbounds/setEnable/", method: http.MethodPost, perm: PermInboundsWrite},
	{prefix: "/inbounds/", method: http.MethodPost, perm: PermInboundsWrite}, // catch-all POST
	{prefix: "/inbounds/import", method: http.MethodPost, perm: PermInboundsWrite},
	// ── clients ──────────────────────────────────────────────────────────
	{prefix: "/clients", method: http.MethodGet, perm: PermClientsRead},
	{prefix: "/clients/add", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/update/", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/del/", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkDel", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkCreate", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkAttach", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkDetach", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkAdjust", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkEnable", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkDisable", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/bulkResetTraffic", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/resetAllTraffics", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/resetTraffic/", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/updateTraffic/", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/clearIps/", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/delOrphans", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/delDepleted", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/import", method: http.MethodPost, perm: PermClientsWrite},
	{prefix: "/clients/", method: http.MethodPost, perm: PermClientsWrite}, // catch-all POST
	{prefix: "/clients/", method: http.MethodDelete, perm: PermClientsWrite},
	// ── xray / routing ───────────────────────────────────────────────────
	{prefix: "/xray", method: http.MethodGet, perm: PermRoutesRead},
	{prefix: "/xray/", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/xray/update", method: http.MethodPost, perm: PermSettingsWrite},
	// ── settings ─────────────────────────────────────────────────────────
	{prefix: "/setting/update", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/updateUser", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/users/create", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/users/delete/", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/users/update/", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/restartPanel", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/apiTokens/create", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/apiTokens/delete/", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/setting/apiTokens/setEnabled/", method: http.MethodPost, perm: PermSettingsWrite},
	// ── nodes ────────────────────────────────────────────────────────────
	{prefix: "/nodes", method: http.MethodPost, perm: PermSettingsWrite},
	{prefix: "/nodes/", method: http.MethodPost, perm: PermSettingsWrite},
}

type routePerm struct {
	prefix string
	method string
	perm   string
}

// requiredPermission returns the permission string needed for a given relative
// API path and HTTP method, or "" if the endpoint is open to all logged-in
// users.  First prefix-match (longest wins because the table is ordered by
// specificity) is used.
func requiredPermission(relPath, method string) string {
	for _, rp := range routePermissions {
		if rp.method != "" && rp.method != method {
			continue
		}
		if strings.HasPrefix(relPath, rp.prefix) {
			return rp.perm
		}
	}
	return ""
}

// userHasPermission reports whether a user's comma-separated permissions
// string includes the requested permission.  Owner role always passes.
func userHasPermission(permissions, role, perm string) bool {
	if perm == "" {
		return true
	}
	if strings.EqualFold(role, "Owner") {
		return true
	}
	for p := range strings.SplitSeq(permissions, ",") {
		if strings.TrimSpace(p) == perm {
			return true
		}
	}
	return false
}

// PermissionMiddleware enforces per-user permission flags for session-login
// callers.  API-token callers already go through enforceTokenScope and are
// not re-checked here (api_authed flag is set).
func PermissionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// API-token callers are governed by enforceTokenScope — skip.
		if c.GetBool("api_authed") {
			c.Next()
			return
		}

		user := session.GetLoginUser(c)
		if user == nil {
			// Not logged in — checkLogin already handles this, but be safe.
			c.Next()
			return
		}

		rel := relPermPath(c.FullPath())
		required := requiredPermission(rel, c.Request.Method)
		if !userHasPermission(user.Permissions, user.Role, required) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"msg":     "permission denied: " + required,
			})
			return
		}
		c.Next()
	}
}

// relPermPath strips the /panel/api prefix so the table stays clean.
func relPermPath(fullPath string) string {
	const marker = "/panel/api"
	_, after, ok := strings.Cut(fullPath, marker)
	if !ok {
		return fullPath
	}
	return after
}
