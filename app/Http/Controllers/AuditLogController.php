<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Only donor-related entries (donor_id set) are shown here — this
     * matches renderAuditLogView(), which is specifically the Donor Record
     * activity trail, not general login/security events.
     */
    public function index()
    {
        $entries = AuditLog::whereNotNull('donor_id')
            ->orderByDesc('logged_at')
            ->limit(200) // mirrors AUDIT_LOG_MAX_ENTRIES already enforced client-side
            ->get()
            ->map->toFrontendArray();

        return response()->json(['entries' => $entries]);
    }

    public function destroyBulk(Request $request)
    {
        $ids = $request->input('ids', []);
        AuditLog::whereIn('id', $ids)->delete();

        return response()->json(['deleted' => count($ids)]);
    }

    public function clear()
    {
        AuditLog::whereNotNull('donor_id')->delete();

        return response()->json(['message' => 'Cleared.']);
    }
}
