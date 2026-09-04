<?php

namespace App\Http\Controllers;

use App\Models\User;

class UserDirectoryController extends Controller
{
    /**
     * Boots the `systemUsers` array on page load with every account in the
     * database (needed so Admin's Staff Approval list and Users Log show
     * accounts registered in other sessions/devices, not just the current
     * browser's localStorage).
     */
    public function index()
    {
        return response()->json([
            'users' => User::orderBy('id')->get()->map->toFrontendArray(),
        ]);
    }
}
