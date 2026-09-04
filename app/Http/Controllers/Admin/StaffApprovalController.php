<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class StaffApprovalController extends Controller
{
    public function approve(Request $request, string $uuid)
    {
        $staff = User::where('uuid', $uuid)->where('role', 'Staff')->firstOrFail();
        $staff->status = 'Approved';
        $staff->action_taken = 'Approved';
        $staff->save();

        AppNotification::create([
            'user_id' => $staff->id,
            'message' => 'Good news! Your Staff account has been approved by the Admin. You can now log in and start using REDFLOW.',
        ]);

        AuditLog::record($request->user()?->id, 'approve_staff', "Approved staff account: {$staff->name} ({$staff->email}).");

        return response()->json(['user' => $staff->toFrontendArray()]);
    }

    public function reject(Request $request, string $uuid)
    {
        $staff = User::where('uuid', $uuid)->where('role', 'Staff')->firstOrFail();
        $name = $staff->name;
        $email = $staff->email;
        $staff->delete();

        AuditLog::record($request->user()?->id, 'reject_staff', "Rejected staff sign-up request: {$name} ({$email}).");

        return response()->json(['message' => 'Rejected.']);
    }
}
