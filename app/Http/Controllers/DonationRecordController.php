<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\MonitoringRecord;
use Illuminate\Http\Request;

class DonationRecordController extends Controller
{
    /**
     * Returns every monitoring record (including its nested `transactions`
     * array) as the same object shape script-legacy.js already stores in
     * localStorage — this is what boots `monitoringRecords` on page load.
     */
    public function index()
    {
        return response()->json([
            'records' => MonitoringRecord::orderBy('id')->get()->map->toFrontendArray(),
        ]);
    }

    /**
     * Creates OR updates a history record, matching exactly what
     * approveAndCommitHistoryRecord() already decides client-side: if a
     * `id` is included in the body and a record with that id exists, this
     * updates it in place (appending to its transactions log); otherwise a
     * new record is created. The New-Donation-vs-Last-Donation logic itself
     * is left untouched in the frontend — this endpoint only persists
     * whatever object the frontend already computed.
     */
    public function upsert(Request $request)
    {
        $body = $request->all();
        $existingId = $body['id'] ?? null;

        $record = $existingId ? MonitoringRecord::find($existingId) : null;

        $attributes = [
            'donor_id' => $body['donorId'] ?? null,
            'donation_date' => $body['donationDate'] ?? now()->toDateString(),
            'blood_type' => $body['bloodType'] ?? null,
            'times_donated' => (int) ($body['timesDonated'] ?? 1),
            'extra' => $body,
        ];

        $donorName = $body['name'] ?? 'Unknown Donor';

        if ($record) {
            $record->update($attributes);
            AuditLog::recordDonorAction($request->user()?->id, 'Update', $record->donor_id, $donorName, 'History Record updated (New Donation / Last Donation).');
        } else {
            $attributes['record_uid'] = 'rec_' . uniqid();
            $record = MonitoringRecord::create($attributes);
            AuditLog::recordDonorAction($request->user()?->id, 'Create', $record->donor_id, $donorName, 'History Record created.');
        }

        return response()->json(['record' => $record->toFrontendArray()], $existingId ? 200 : 201);
    }

    /**
     * Bulk delete — mirrors deleteSelectedRecords() in script-legacy.js.
     */
    public function destroyBulk(Request $request)
    {
        $ids = $request->input('ids', []);
        $records = MonitoringRecord::whereIn('id', $ids)->get();
        foreach ($records as $record) {
            AuditLog::recordDonorAction($request->user()?->id, 'Delete', $record->donor_id, $record->extra['name'] ?? 'Unknown Donor', 'History Record deleted.');
        }
        MonitoringRecord::whereIn('id', $ids)->delete();

        return response()->json(['deleted' => count($ids)]);
    }
}
