**DMS Purchase Approval Portal — Formal System Documentation**
Document date: March 13, 2026  
Prepared for: Project team  
Authoring source: Codebase review (authoritative backend: `purchase-backend/main.py`)

**Table Of Contents**
1. Purpose And Scope  
2. System Overview  
3. Architecture And Components  
4. Technology Stack  
5. User Roles And Access  
6. Business Workflow  
7. External Integrations  
8. API Specification  
9. Data Model And Database Tables  
10. Status Codes And State Flags  
11. Frontend Screens And Routes  
12. Configuration And Runtime Assumptions  
13. Known Gaps And Assumptions  
14. Appendix: Files Reviewed

**1. Purpose And Scope**
This document describes the DMS Purchase Approval Portal as implemented in the current codebase. It covers API endpoints, data models, workflows, UI pages, and integrations. Third‑party dependencies are excluded by request. Secrets and credentials are redacted.

**2. System Overview**
The system provides a purchase requisition workflow where initiators submit requests with vendor quotations. Requests move through a multi‑stage approval chain. Approvers review pending items, approve, reject, or send back to initiators. Documents are stored in SharePoint and metadata is stored in an Oracle database.

**3. Architecture And Components**
Component list:
- Backend API: FastAPI app in `purchase-backend/main.py`
- Frontend UI: React + Vite app in `purchase-portal/src`
- Database: Oracle (DMS tables + external reference tables)
- Document storage: SharePoint Online
- Authentication: Custom username/password API login; Azure AD MSAL configuration exists but is not wired into flows

High‑level flow:
- Initiator submits a purchase request with attachments.
- Backend uploads files to SharePoint and stores metadata in Oracle.
- Approvers see pending requests based on their employee code.
- Actions update status fields and log entries.
- Initiators can view status, resubmit sent‑back items, and view details.

**4. Technology Stack**
Backend:
- Python 3.x
- FastAPI
- Oracle DB driver: `oracledb`
- SharePoint client: `office365` SDK

Frontend:
- React
- Vite
- Ant Design
- Axios
- React Router
- Tailwind CSS (utility classes and custom styles)

**5. User Roles And Access**
Roles used in the system:
- INITIATOR
- MANAGER
- SR_MANAGER
- PMC
- PI
- AC
- AD
- DIR
- PD
- PURCHASE_HEAD
- MATERIAL_HEAD
- FINAL_DG

Role determination is based on the logged‑in user’s `empcode` and the approval codes stored in the requisition master table.

**6. Business Workflow**
Summary:
- Initiator creates a request (optionally with PR No), adds vendors and uploads files.
- Backend creates a requisition record and initializes the approval chain.
- Approvers see pending requests where their `empcode` matches the current pending stage.
- Approver actions update approval fields and advance the chain.
- Requests can be rejected or sent back for changes.
- Initiator can resubmit sent‑back requests.

Approval chain behavior as coded:
- MANAGER → SR_MANAGER → PMC → PI
- PI advances to AC, AD, DIR, or PD depending on availability in `PIApprovalMatrix`
- AC and AD follow the same fallback logic
- DIR advances to PD if available, otherwise to PURCHASE_HEAD
- PD advances to PURCHASE_HEAD
- PURCHASE_HEAD advances to MATERIAL_HEAD
- MATERIAL_HEAD advances to FINAL_DG if amount > 1,000,000; otherwise the chain ends

**7. External Integrations**
SharePoint:
- Site: `[REDACTED]`
- Folder path per PR: `/sites/KM/Test1/{PR_NO}`
- Main document renamed to `{PR_NO}_Main_Document.{ext}`
- Vendor quotations renamed to `{PR_NO}_VENDOR{n}.{ext}`

Oracle DB:
- Connection uses hard‑coded credentials in code (redacted here).
- Tables include DMS requisition master, vendor details, approvals log, and users.
- External reference tables are queried for PR numbers, projects, vendors, and approval matrix.

Azure AD (MSAL):
- AAD client/tenant IDs are configured in frontend files but not actively used in authentication flow.

**8. API Specification**
Base URL:
- `http://127.0.0.1:8000` (frontend default in `purchase-portal/src/api/api.js`)

Authentication:
- Custom login endpoint `/login` returns `role` and `empcode`.
- Frontend stores `username`, `role`, `empcode` in `localStorage`.

**8.1 API Summary Table**
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/get_prno` | List recent PR numbers |
| GET | `/get_project` | Fetch project code for a PR |
| GET | `/vendors` | List vendor names |
| POST | `/submit_pr` | Submit new requisition with files |
| GET | `/approval/pending` | List pending approvals for empcode |
| POST | `/approval/action` | Approve a request |
| POST | `/approval/reject` | Reject a request |
| POST | `/approval/sent-back` | Send back a request |
| GET | `/approval/details` | Get full request details |
| POST | `/login` | Authenticate user |
| GET | `/initiator/requests` | List initiator’s requests |
| GET | `/initiator/sent-back` | List sent‑back requests |
| POST | `/initiator/resubmit` | Resubmit sent‑back request (status reset) |
| POST | `/resubmit_pr` | Resubmit with updated details and vendors |
| GET | `/request/details` | Get request header and vendor rows |
| GET | `/matrix/{project_code}` | Get approval matrix for project |
| GET | `/purchase/{pr_no}` | Get requisition by PR No |

**8.2 Endpoint Details**
GET `/get_prno`
- Query parameters: none
- Response: `[{"pr_no": "<string>"}]`
- Data source: `purchase_requisition_master` (last ~352 days)

GET `/get_project`
- Query parameters: `pr_no` (string)
- Response: `{"project_code": "<string>"}` or empty string
- Data source: `purchase_requisition_master`

GET `/vendors`
- Query parameters: none
- Response: `[{"vendor_name": "<string>"}]`
- Data source: `MATERIAL_CONTACT_TEST`

POST `/submit_pr`
- Content‑Type: `multipart/form-data`
- Fields:  
`pr_no`, `project_code`, `document_title`, `description`, `total_amount`, `initiator_remark`, `initiator_empcode`, `vendors` (JSON array string)  
- Files:  
`file` (main document, one or more), `quotation_{i}` for each vendor row
- Behavior: uploads files to SharePoint, inserts into `DMS_REQUISITION_MASTER` and `DMS_REQUISITION_VENDOR`, initializes approval codes
- Response: `{"status":"submitted","req_id": <number>}` or error

GET `/approval/pending`
- Query parameters: `empcode`
- Response: list of requisitions where any approval stage for the given `empcode` is pending

POST `/approval/action`
- Body (JSON): `{"req_id": <int>, "pr_no": "<string?>", "action": "A", "empcode": "<string>", "remark": "<string?>"}`
- Behavior: determines current role by `empcode` and pending flag, updates approval fields, logs into `DMS_APPROVAL_LOG`
- Response: `{"status":"updated"}` or error

POST `/approval/reject`
- Body (JSON): `{"req_id": <int>, "pr_no": "<string>", "empcode": "<string>", "remark": "<string?>"}`
- Behavior: sets `STATUS='REJECTED'`, sets role‑specific approval column to `R`, logs into `DMS_APPROVAL_LOG`

POST `/approval/sent-back`
- Body (JSON): `{"req_id": <int>, "pr_no": "<string?>", "empcode": "<string?>", "remark": "<string?>"}`
- Behavior: sets `STATUS='SENT_BACK'`, resets approval flags, logs a SYSTEM entry

GET `/approval/details`
- Query parameters: `req_id`
- Response: `header`, `vendors`, `approval_history`
- Header fields: `req_id`, `pr_no`, `project_code`, `title`, `description`, `amount`, `main_doc`

POST `/login`
- Body (JSON): `{"username":"<string>","password":"<string>"}`
- Response on success: `{"status":"success","username":"<string>","role":"<string>","empcode":"<string>"}`
- Response on failure: `{"status":"error","message":"Invalid Credentials"}`

GET `/initiator/requests`
- Query parameters: `empcode`
- Response: list of requisitions and approval status fields, excluding sent‑back items

GET `/initiator/sent-back`
- Query parameters: `empcode`
- Response: list of sent‑back requisitions with remarks and date

POST `/initiator/resubmit`
- Query parameters: `req_id` (integer)
- Behavior: resets status to `SUBMITTED`, clears sent‑back fields, sets approvals back to pending state

POST `/resubmit_pr`
- Content‑Type: accepts JSON or form
- Fields: `req_id`, `pr_no`, `project_code`, `document_title`, `description`, `total_amount`, `initiator_remark`, `initiator_empcode`, `vendors`
- Behavior: updates master, deletes old vendors, inserts new vendors, resets approval status

GET `/request/details`
- Query parameters: `req_id`
- Response: header and vendors (used by edit page)

GET `/matrix/{project_code}`
- Path parameter: `project_code`
- Response: `{"pi": "...", "ac": "...", "ad": "...", "dir": "...", "pd": "..."}`

GET `/purchase/{pr_no}`
- Path parameter: `pr_no`
- Response: requisition metadata and `manager_remark`

**9. Data Model And Database Tables**
Authoritative definitions are taken from `edit DMS_USERS.txt` and actual fields referenced in code. The schema for external tables is not available in this codebase.

**9.1 DMS_USERS**
Observed usage in code:
- `USERNAME`, `PASSWORD`, `ROLE`, `EMPCODE`

Note: A test SQL snippet defines `USERNAME`, `PASSWORD`, `ROLE` only. The running schema must include `EMPCODE` because the API selects it.

**9.2 DMS_REQUISITION_MASTER**
Defined in `edit DMS_USERS.txt`:
| Column | Type |
| --- | --- |
| REQ_ID | NUMBER (PK) |
| PR_NO | VARCHAR2(50) |
| PROJECT_CODE | VARCHAR2(50) |
| DOCUMENT_TITLE | VARCHAR2(200) |
| DESCRIPTION | VARCHAR2(500) |
| MAIN_DOC_URL | VARCHAR2(500) |
| TOTAL_AMOUNT | NUMBER |
| INITIATOR_REMARK | VARCHAR2(500) |
| INITIATOR_CODE | VARCHAR2(20) |
| MANAGER_APR | VARCHAR2(5) |
| MANAGER_CODE | NUMBER |
| MANAGER_APR_DATE | DATE |
| MANAGER_REMARK | VARCHAR2(500) |
| SR_MANAGER_APR | VARCHAR2(5) |
| SR_MANAGER_CODE | VARCHAR2(20) |
| SR_MANAGER_APR_DATE | DATE |
| SR_MANAGER_REMARK | VARCHAR2(500) |
| PMC_APR | VARCHAR2(5) |
| PMC_CODE | VARCHAR2(20) |
| PMC_APR_DATE | DATE |
| PMC_REMARK | VARCHAR2(500) |
| PI_CODE | VARCHAR2(20) |
| PI_APR_DATE | DATE |
| PI_REMARKS | VARCHAR2(500) |
| AC_CODE | VARCHAR2(20) |
| AC_APR_DATE | DATE |
| AC_REMARKS | VARCHAR2(500) |
| AD_CODE | VARCHAR2(20) |
| AD_APR_DATE | DATE |
| AD_REMARKS | VARCHAR2(500) |
| DIR_CODE | VARCHAR2(20) |
| DIR_APR_DATE | DATE |
| DIR_REMARKS | VARCHAR2(500) |
| PD_CODE | VARCHAR2(20) |
| PD_APR_DATE | DATE |
| PD_REMARKS | VARCHAR2(500) |
| PURCHASE_HEAD_APR | VARCHAR2(5) |
| PURCHASE_HEAD_CODE | VARCHAR2(20) |
| PURCHASE_HEAD_DATE | DATE |
| PURCHASE_HEAD_REMARKS | VARCHAR2(500) |
| MATERIAL_HEAD_APR | VARCHAR2(5) |
| MATERIAL_HEAD_CODE | VARCHAR2(20) |
| MATERIAL_HEAD_APR_DATE | DATE |
| MATERIAL_HEAD_REMARKS | VARCHAR2(500) |
| DG_CODE | VARCHAR2(20) |
| DG_APR_DATE | DATE |
| DG_REMARKS | VARCHAR2(500) |
| SENT_BACK_FLAG | VARCHAR2(5) |
| SENT_BACK_CODE | VARCHAR2(20) |
| SENT_BACK_DATE | DATE |
| SENT_BACK_REMARK | VARCHAR2(500) |
| CREATED_DATE | DATE (default SYSDATE) |

Fields referenced in code but not defined above:
- `STATUS`
- `FINAL_DG_APR`, `FINAL_DG_CODE`, `FINAL_DG_DATE`, `FINAL_DG_REMARK`

There is also an `ALTER TABLE ... ADD MAIN_DOC_URLS CLOB` note in `edit DMS_USERS.txt`, but the code uses `MAIN_DOC_URL`.

**9.3 DMS_REQUISITION_VENDOR**
Defined in `edit DMS_USERS.txt`:
| Column | Type |
| --- | --- |
| REQ_ID | NUMBER (FK) |
| VENDOR_NAME | VARCHAR2(200) |
| AMOUNT | NUMBER |
| VENDOR_RANKING | VARCHAR2(10) |
| REMARKS | VARCHAR2(500) |
| QUOTATION_DOC_URL | VARCHAR2(500) |

**9.4 DMS_APPROVAL_LOG**
Defined in `edit DMS_USERS.txt`:
| Column | Type |
| --- | --- |
| ID | NUMBER (IDENTITY) |
| REQ_ID | NUMBER |
| PR_NO | VARCHAR2(50) |
| ROLE | VARCHAR2(50) |
| USER_NAME | VARCHAR2(100) |
| ACTION | VARCHAR2(20) |
| REMARK | VARCHAR2(500) |
| ACTION_DATE | DATE |

Note: The code inserts log rows without `USER_NAME`, so that column may be NULL unless populated elsewhere.

**9.5 Sequences**
From `edit DMS_USERS.txt`:
- `DMS_REQ_SEQS` (sequence)

Code uses:
- `DMS_REQ_SEQ.NEXTVAL`

Sequence naming should be aligned.

**9.6 External Referenced Tables (Schema Not In Codebase)**
The following are queried but not defined in the repository and will be documented as external dependencies:
- `PIApprovalMatrix`
- `purchase_requisition_master`
- `MATERIAL_CONTACT_TEST`
- `employee_onroll` (used in test queries)

**10. Status Codes And State Flags**
Approval codes (from `Apprval.Doc`):
- `P`: Pending
- `A`: Approved
- `R`: Rejected
- `N`: Not Started

Request‑level statuses used in code:
- `STATUS='SENT_BACK'`
- `STATUS='REJECTED'`
- `STATUS='SUBMITTED'`

Sent‑back fields:
- `SENT_BACK_FLAG`, `SENT_BACK_REMARK`, `SENT_BACK_DATE`

**11. Frontend Screens And Routes**
Routes and access logic in `purchase-portal/src/App.jsx`:
- `/login` → Login page
- `/purchase` → Initiator request creation
- `/approval` → Approver dashboard
- `/my-requests` → Initiator requests
- `/request/:reqid` → Request details
- `/sent-back` → Sent back list
- `/edit-request/:req_id` → Edit and resubmit

Key pages:
- `LoginPage.jsx`: custom login form that calls `/login`
- `PurchaseCreate.jsx`: create and edit requisitions; calls `/get_prno`, `/vendors`, `/get_project`, `/submit_pr`, `/request/details`, `/resubmit_pr`
- `InitiatorDashboard.jsx`: lists initiator requests with status tags
- `ApprovalPage.jsx`: lists pending approvals and provides approve/reject/sent‑back actions
- `RequestDetails.jsx`: shows requisition details and vendor quotations
- `SentBackPage.jsx`: lists sent‑back requests and navigates to edit/resubmit

**12. Configuration And Runtime Assumptions**
Backend:
- CORS allows all origins (development setting)
- Oracle credentials are hard‑coded in code (redacted)
- SharePoint client ID/secret are hard‑coded in code (redacted)

Frontend:
- API base URL is hard‑coded to `http://127.0.0.1:8000`
- MSAL config exists but is not integrated into the login flow

**13. Known Gaps And Assumptions**
This section records discrepancies between code and available SQL definitions:
- `DMS_USERS` schema must include `EMPCODE` because it is selected in `/login`.
- `DMS_REQUISITION_MASTER` uses `STATUS` and `FINAL_DG_*` fields in code but these are not present in the provided table definition.
- Sequence name mismatch: `DMS_REQ_SEQ` vs `DMS_REQ_SEQS`.
- `approval_details` endpoint does not return `initiator_remark`, but frontend expects it in `ApprovalPage.jsx`.
- `RequestDetails.jsx` treats `main_doc` as a list, but backend returns a single string path.
- `Layout.jsx` imports `Sidebar` which is not present in `purchase-portal/src/components`.
- External tables `PIApprovalMatrix`, `purchase_requisition_master`, `MATERIAL_CONTACT_TEST` are required but their schemas are not in this repo.

**14. Appendix: Files Reviewed**
Backend:
- `purchase-backend/main.py` (authoritative)
- `main.py` (backup; not used)

Frontend:
- `purchase-portal/src/App.jsx`
- `purchase-portal/src/api/api.js`
- `purchase-portal/src/authConfig.js`
- `purchase-portal/src/msalInstance.js`
- `purchase-portal/src/main.jsx`
- `purchase-portal/src/pages/ApprovalPage.jsx`
- `purchase-portal/src/pages/LoginPage.jsx`
- `purchase-portal/src/pages/PurchaseCreate.jsx`
- `purchase-portal/src/pages/InitiatorDashboard.jsx`
- `purchase-portal/src/pages/RequestDetails.jsx`
- `purchase-portal/src/pages/SentBackPage.jsx`
- `purchase-portal/src/components/Header.jsx`
- `purchase-portal/src/components/Layout.jsx`
- `purchase-portal/src/style.css`
- `purchase-portal/src/index.css`
- `purchase-portal/src/App.css`

Notes and SQL references:
- `edit DMS_USERS.txt`
- `TESTDatabase.txt`
- `Apprval.Doc`
- `Portal.txt`
- `Purchasecreate.txt`
