# Data Retention Policy

## Overview
The Suryas Intranet no longer performs automatic data resets. Records are retained unless an administrator explicitly performs a targeted cleanup of operational data. The user store remains protected and the leadership accounts are not deleted or reset as part of any retention workflow.

## Current Policy

### Active Retention
- **Status**: ✅ Retention is disabled for automatic reset
- **Action**: No automatic deletion of requests, projects, ledger entries, or user records
- **Operational data**: Kept in place for ongoing workflow and audit review

### Protected Records
- **User accounts**: Preserved, including Hareesh V, Santhana Kumar V, G K Bharath, and Sabir Mohammed
- **Requests**: Leave, allowance, founders requests, project approvals and other submissions remain intact
- **Notifications**: No automatic reset notifications are created
- **System configuration**: Retention settings are informational only and do not trigger destructive reset actions

## Manual Reset Guidance
If a reset is ever required for a specific operational dataset, it must be performed only with explicit intent and should never wipe the user registry or protected leadership accounts.

### Safe Reset Scope
- Approval requests
- Ledger entries
- Related operational logs

### Protected Scope
- `.data/users.json`
- Leadership accounts such as `gkbharath`, `santhanakumarv`, `hareeshv`, and any protected admin/founder records

## API Behavior

### Check Data Retention Status
```
GET /api/admin/data-retention?action=status
```
Response:
```json
{
  "status": "active",
  "message": "Data retention auto-reset is disabled. Requests and user accounts are retained.",
  "daysRemaining": 0,
  "retentionDisabled": true
}
```

### Notifications
The retention notification flow is disabled and returns an empty list. No automatic reset warnings are displayed in the admin dashboard.

## Notes
This policy was intentionally changed to prevent unwanted data loss and to guarantee that the application remains stable without destructive resets during normal operations.
