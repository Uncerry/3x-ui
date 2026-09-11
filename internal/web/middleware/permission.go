package middleware

import (
	"net/http"
	"strings"

	"github.com/mhsanaei/3x-ui/v3/internal/web/session"

	"github.com/gin-gonic/gin"
)

// All available permission flags stored comma-separated in users.permissions.
const (
	PermInboundsRead  = "inbounds.read"
	PermInboundsWrite = "inbounds.write"
	PermClientsRead   = "clients.read"
	PermClientsWrite  = "clients.write"
	PermSettingsWrite = "settings.write"
	PermRoutesRead    = "routes.read"
	PermXrayManage    = "xray.manage"   // stop/restart/install xray
	PermServerAdmin   = "server.admin"  // importDB, updatePanel, updateGeofile, logs
	PermNodesManage   = "nodes.manage"  // add/update/delete nodes
	PermNodesRead     = "nodes.read"    // list/get nodes
)

// routePermissions maps relative paths (after /panel/api) to required permission.
// Empty method = any method. First matching entry wins — order by specificity.
var routePermissions = []routePerm{
	// ── inbounds ─────────────────────────────────────────────────────────────
	{"/inbounds", http.MethodGet, PermInboundsRead},
	{"/inbounds/add", http.MethodPost, PermInboundsWrite},
	{"/inbounds/del/", http.MethodPost, PermInboundsWrite},
	{"/inbounds/bulkDel", http.MethodPost, PermInboundsWrite},
	{"/inbounds/update/", http.MethodPost, PermInboundsWrite},
	{"/inbounds/setEnable/", http.MethodPost, PermInboundsWrite},
	{"/inbounds/import", http.MethodPost, PermInboundsWrite},
	{"/inbounds/", http.MethodPost, PermInboundsWrite},

	// ── clients ──────────────────────────────────────────────────────────────
	{"/clients", http.MethodGet, PermClientsRead},
	{"/clients/add", http.MethodPost, PermClientsWrite},
	{"/clients/update/", http.MethodPost, PermClientsWrite},
	{"/clients/del/", http.MethodPost, PermClientsWrite},
	{"/clients/bulkDel", http.MethodPost, PermClientsWrite},
	{"/clients/bulkCreate", http.MethodPost, PermClientsWrite},
	{"/clients/bulkAttach", http.MethodPost, PermClientsWrite},
	{"/clients/bulkDetach", http.MethodPost, PermClientsWrite},
	{"/clients/bulkAdjust", http.MethodPost, PermClientsWrite},
	{"/clients/bulkEnable", http.MethodPost, PermClientsWrite},
	{"/clients/bulkDisable", http.MethodPost, PermClientsWrite},
	{"/clients/bulkResetTraffic", http.MethodPost, PermClientsWrite},
	{"/clients/resetAllTraffics", http.MethodPost, PermClientsWrite},
	{"/clients/resetTraffic/", http.MethodPost, PermClientsWrite},
	{"/clients/updateTraffic/", http.MethodPost, PermClientsWrite},
	{"/clients/clearIps/", http.MethodPost, PermClientsWrite},
	{"/clients/delOrphans", http.MethodPost, PermClientsWrite},
	{"/clients/delDepleted", http.MethodPost, PermClientsWrite},
	{"/clients/import", http.MethodPost, PermClientsWrite},
	{"/clients/", http.MethodPost, PermClientsWrite},
	{"/clients/", http.MethodDelete, PermClientsWrite},

	// ── xray engine control ──────────────────────────────────────────────────
	{"/server/stopXrayService", http.MethodPost, PermXrayManage},
	{"/server/restartXrayService", http.MethodPost, PermXrayManage},
	{"/server/installXray/", http.MethodPost, PermXrayManage},

	// ── server administration ────────────────────────────────────────────────
	{"/server/importDB", http.MethodPost, PermServerAdmin},
	{"/server/updatePanel", http.MethodPost, PermServerAdmin},
	{"/server/setUpdateChannel", http.MethodPost, PermServerAdmin},
	{"/server/updateGeofile", http.MethodPost, PermServerAdmin},
	{"/server/logs/", http.MethodPost, PermServerAdmin},
	{"/server/xraylogs/", http.MethodPost, PermServerAdmin},
	{"/server/amneziawglogs/", http.MethodPost, PermServerAdmin},
	{"/server/getDb", http.MethodGet, PermServerAdmin},
	{"/server/getMigration", http.MethodGet, PermServerAdmin},

	// ── nodes ────────────────────────────────────────────────────────────────
	{"/nodes/list", http.MethodGet, PermNodesRead},
	{"/nodes/get/", http.MethodGet, PermNodesRead},
	{"/nodes/webCert/", http.MethodGet, PermNodesRead},
	{"/nodes/history/", http.MethodGet, PermNodesRead},
	{"/nodes/add", http.MethodPost, PermNodesManage},
	{"/nodes/update/", http.MethodPost, PermNodesManage},
	{"/nodes/del/", http.MethodPost, PermNodesManage},
	{"/nodes/setEnable/", http.MethodPost, PermNodesManage},
	{"/nodes/test", http.MethodPost, PermNodesManage},
	{"/nodes/probe/", http.MethodPost, PermNodesManage},
	{"/nodes/updatePanel", http.MethodPost, PermNodesManage},
	{"/nodes/mtls/", http.MethodPost, PermNodesManage},
	{"/nodes/inbounds", http.MethodPost, PermNodesRead},

	// ── xray config / routes ─────────────────────────────────────────────────
	{"/xray", http.MethodGet, PermRoutesRead},
	{"/xray/", http.MethodGet, PermRoutesRead},
	{"/xray/update", http.MethodPost, PermSettingsWrite},
	{"/xray/", http.MethodPost, PermSettingsWrite},

	// ── panel settings ───────────────────────────────────────────────────────
	{"/setting/update", http.MethodPost, PermSettingsWrite},
	{"/setting/updateUser", http.MethodPost, PermSettingsWrite},
	{"/setting/users/create", http.MethodPost, PermSettingsWrite},
	{"/setting/users/delete/", http.MethodPost, PermSettingsWrite},
	{"/setting/users/update/", http.MethodPost, PermSettingsWrite},
	{"/setting/restartPanel", http.MethodPost, PermSettingsWrite},
	{"/setting/apiTokens/create", http.MethodPost, PermSettingsWrite},
	{"/setting/apiTokens/delete/", http.MethodPost, PermSettingsWrite},
	{"/setting/apiTokens/setEnabled/", http.MethodPost, PermSettingsWrite},
}

type routePerm struct {
	prefix string
	method string
	perm   string
}

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

// userHasPermission checks the comma-separated permissions string.
// Owner role bypasses all checks.
func userHasPermission(permissions, role, perm string) bool {
	if perm == "" {
		return true
	}
	if strings.EqualFold(role, "Owner") {
		return true
	}
	for _, p := range strings.Split(permissions, ",") {
		if strings.TrimSpace(p) == perm {
			return true
		}
	}
	return false
}

// PermissionMiddleware enforces per-user permission flags for session-login callers.
// API-token callers are already handled by enforceTokenScope.
func PermissionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetBool("api_authed") {
			c.Next()
			return
		}
		user := session.GetLoginUser(c)
		if user == nil {
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

func relPermPath(fullPath string) string {
	const marker = "/panel/api"
	_, after, ok := strings.Cut(fullPath, marker)
	if !ok {
		return fullPath
	}
	return after
}
