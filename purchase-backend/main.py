import oracledb
from fastapi import FastAPI, Request, Form
from pydantic import BaseModel
import json
from fastapi.middleware.cors import CORSMiddleware
from office365.sharepoint.client_context import ClientContext
from office365.runtime.auth.user_credential import UserCredential
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import json
import os

class ApprovalAction(BaseModel):
    req_id: int
    pr_no: Optional[str] = None
    action: str
    empcode: str
    remark: Optional[str] = None

class RejectAction(BaseModel):
    req_id: int
    pr_no: str
    empcode: str
    remark: str    

class SentBackAction(BaseModel):
    req_id: int
    pr_no: Optional[str] = None
    empcode: Optional[str] = None
    remark: Optional[str] = None
    

class RequestModel(BaseModel):
    req_id: int
    description: str
    amount: str

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (for development only)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



def get_conn():
    return oracledb.connect(
        user="erpdev",
        password="erpdevtest",
        dsn="172.16.0.9:1521/orcl"
    )


def normalize_db_value(value):
    if value is None:
        return None
    if hasattr(value, "read"):
        lob_data = value.read()
        if isinstance(lob_data, bytes):
            return lob_data.decode("utf-8", errors="ignore")
        return lob_data
    return value


def normalize_identifier(value):
    if value is None:
        return ""
    return str(value).strip()

@app.get("/")
def root():
    return {"status": "server running", "app": "Approval Portal Backend"}

@app.get("/get_prno")
def get_prno():

    conn = oracledb.connect(
        user="erpdev",
        password="erpdevtest",
        dsn="orcldr"
    )

    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT TMP_PR_NO
        FROM purchase_requisition_master
        WHERE CR_DATE >= SYSDATE - 352
        ORDER BY CR_DATE DESC
    """)

    data = [{"pr_no": r[0]} for r in cursor.fetchall()]

    cursor.close()
    conn.close()
  
  
    return data

#----GET PROJECT------

@app.get("/get_project")
def get_project(pr_no: str):

    conn = oracledb.connect(
        user="erpdev",
        password="erpdevtest",
        dsn="orcldr"
    )

    cursor = conn.cursor()

    query = """
        SELECT PRJ_CODE
        FROM purchase_requisition_master
        WHERE TMP_PR_NO = :1
    """

    cursor.execute(query, [pr_no])

    row = cursor.fetchone()

    cursor.close()
    conn.close()

    if row:
        return {"project_code": row[0]}
    else:
        return {"project_code": ""}
    
 # Project end   

#-----Vendor API---------

@app.get("/vendors")
def get_vendors():

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT ORGANISATION_NAME
        FROM MATERIAL_CONTACT_TEST
        ORDER BY ORGANISATION_NAME
    """)

    data = [
        {
            
            "vendor_name": r[0]
        }
        for r in cursor.fetchall()
    ]

    cursor.close()
    conn.close()

    return data

#------Vendor API-------END----


# SharePoint Config
from office365.runtime.auth.client_credential import ClientCredential
from office365.sharepoint.client_context import ClientContext

SP_SITE = "https://teriindia.sharepoint.com/sites/KM"
CLIENT_ID = "5099564c-a6f8-4cc1-9d77-232e4acc8aaa"
CLIENT_SECRET = os.getenv("CLIENT_SECRET")


def upload_to_sharepoint(file_bytes, file_name, project_code):

    credentials = ClientCredential(CLIENT_ID, CLIENT_SECRET)

    ctx = ClientContext(SP_SITE).with_credentials(credentials)

    #  PR wise folder path
    folder_path = f"/sites/KM/Test1/{project_code}"

    
    try:
        ctx.web.folders.add(folder_path).execute_query()
    except:
        pass

    target_folder = ctx.web.get_folder_by_server_relative_url(folder_path)

    upload_file = target_folder.upload_file(file_name, file_bytes).execute_query()

    return upload_file.serverRelativeUrl

@app.post("/submit_pr")
async def submit_pr(request: Request):

    form = await request.form()

    print("FULL FORM DATA:", dict(form))

    pr_no = form.get("pr_no")
    project_code = form.get("project_code")
    document_title = form.get("document_title")
    description = form.get("description")
    total_amount = form.get("total_amount")
    initiator_remark = form.get("initiator_remark")
    initiator_code = normalize_identifier(
        form.get("initiator_code")
        or form.get("initiator_empcode")
        or form.get("empcode")
        or form.get("initiator")
    )

    if not initiator_code:
        return {
            "status": "error",
            "message": "Initiator code missing in submit payload"
        }

    vendors = json.loads(form.get("vendors") or "[]")

    print("POST HIT")
    print("PR_NO:", pr_no)
    print("Initiator:", initiator_code)

    

    # ================= MAIN FILE =================
    main_doc_urls = []

    files = form.getlist("file")   # multiple files

    for file in files:

        content = file.file.read()
        ext = file.filename.split(".")[-1]

        new_main_name = f"{project_code}_Main_{len(main_doc_urls)+1}.{ext}"

        url = upload_to_sharepoint(content, new_main_name, project_code)

        main_doc_urls.append(url)

        
        main_doc_urls_json = json.dumps(main_doc_urls)

    # ================= VENDOR QUOTATIONS =================
    for i, v in enumerate(vendors):

        q_key = f"quotation_{i}"

        if q_key in form:

            qfile = form[q_key]
            content = qfile.file.read()

            ext = qfile.filename.split(".")[-1]
            new_vendor_name = f"{project_code}_VENDOR{i+1}.{ext}"

            sp_url = upload_to_sharepoint(content, new_vendor_name, project_code)

            vendors[i]["quotation_url"] = sp_url

    conn = get_conn()
    cursor = conn.cursor()

    try:

        # ================= GENERATE REQ_ID =================
        cursor.execute("SELECT DMS_REQ_SEQ.NEXTVAL FROM dual")
        req_id = cursor.fetchone()[0]

        print("REQ_ID:", req_id)

        # ================= MATRIX FETCH =================
        cursor.execute("""
        SELECT
        PI_CODE,
        AC_CODE,
        AD_CODE,
        DIR_CODE,
        PD_CODE
        FROM PIApprovalMatrix
        WHERE PROJECT_CODE = :1
        """,[project_code])

        matrix = cursor.fetchone()

        if not matrix:
            raise Exception("Approval Matrix not found")

        pi_code, ac_code, ad_code, dir_code, pd_code = matrix

        print("Matrix:", pi_code, ac_code, ad_code, dir_code, pd_code)

       # ================= HEADER INSERT =================
        cursor.execute("""
            INSERT INTO DMS_REQUISITION_MASTER (
            REQ_ID,
            PR_NO,
            PROJECT_CODE,
            DOCUMENT_TITLE,
            DESCRIPTION,
            MAIN_DOC_URLS,
            TOTAL_AMOUNT,
            INITIATOR_REMARK,
            INITIATOR_CODE,

            MANAGER_APR,
            MANAGER_CODE,

            SR_MANAGER_APR,
            SR_MANAGER_CODE,

            PMC_APR,
            PMC_CODE,

            PI_CODE,
            AC_CODE,
            AD_CODE,
            DIR_CODE,
            PD_CODE,

            MATERIAL_HEAD_APR,
            MATERIAL_HEAD_CODE,

            PURCHASE_HEAD_APR,
            PURCHASE_HEAD_CODE,

            FINAL_DG_APR,
            FINAL_DG_CODE,

            SENT_BACK_FLAG
            )
            VALUES(
            :1,:2,:3,:4,:5,:6,:7,:8,:9,

            'P','0797',

            'N','4496',

            'N','0967',

            :10,:11,:12,:13,:14,

            'N','2384',

            'N','4474',

            'N','0024',

            'N'
            )
            """,[
            req_id,
            pr_no,
            project_code,
            document_title,
            description,
            main_doc_urls_json,
            total_amount,
            initiator_remark,
            initiator_code,

            pi_code,
            ac_code,
            ad_code,
            dir_code,
            pd_code
])

        print("HEADER INSERT DONE")

        # ================= VENDOR INSERT =================
        for v in vendors:

            print("VENDOR INSERT:", v)

            cursor.execute("""
            INSERT INTO DMS_REQUISITION_VENDOR(
                REQ_ID,
                VENDOR_NAME,
                AMOUNT,
                VENDOR_RANKING,
                REMARKS,
                QUOTATION_DOC_URL
            )
            VALUES(:1,:2,:3,:4,:5,:6)
            """,[
                req_id,
                v.get("vendor_name"),
                v.get("amount"),
                v.get("vendor_ranking"),
                v.get("remark"),
                v.get("quotation_url")
            ])

        print("VENDOR INSERT DONE")

        conn.commit()

        print("COMMIT SUCCESS")

    except Exception as e:

        conn.rollback()

        print("ERROR:", e)

        return {
            "status":"error",
            "message":str(e)
        }

    finally:

        cursor.close()
        conn.close()

    return {
        "status":"submitted",
        "req_id":req_id
    }
#-------SubmitAPIend-----------


@app.get("/approval/pending")
def get_pending(empcode: str):

    conn = get_conn()
    cursor = conn.cursor()


    cursor.execute("""
         SELECT REQ_ID, PR_NO, PROJECT_CODE, DOCUMENT_TITLE, TOTAL_AMOUNT
        FROM DMS_REQUISITION_MASTER m
        WHERE

        (
            (MANAGER_APR='P' AND MANAGER_CODE=:emp)
            OR
            (SR_MANAGER_APR='P' AND SR_MANAGER_CODE=:emp)
            OR
            (PMC_APR='P' AND PMC_CODE=:emp)
            OR
            (PI_APR='P' AND PI_CODE=:emp)
            OR
            (AC_APR='P' AND AC_CODE=:emp)
            OR
            (AD_APR='P' AND AD_CODE=:emp)
            OR
            (PD_APR='P' AND PD_CODE=:emp)
            OR
            (PURCHASE_HEAD_APR='P' AND PURCHASE_HEAD_CODE=:emp)
            OR
            (MATERIAL_HEAD_APR='P' AND MATERIAL_HEAD_CODE=:emp)
            OR
            (FINAL_DG_APR='P' AND FINAL_DG_CODE=:emp)
        )
        """, {"emp": empcode})

    rows = cursor.fetchall()

    data = [
        {
            "req_id": r[0],
            "pr_no": r[1],
            "project_code": r[2],
            "title": r[3],
            "amount": r[4]
        }
        for r in rows
    ]

    cursor.close()
    conn.close()

    return data

#------Approval Action API-------

@app.post("/approval/action")
def approval_action(data: ApprovalAction):

    req_id = data.req_id
    def normalize_emp_code(value):
        parsed_value = normalize_db_value(value)
        if parsed_value is None:
            return ""
        code = str(parsed_value).strip()
        if code.lower() == "none":
            return ""
        normalized = code.lstrip("0")
        return normalized if normalized else "0"

    def is_pending(value):
        status = normalize_db_value(value)
        if status is None:
            return False
        return str(status).strip().upper() == "P"

    empcode = normalize_emp_code(data.empcode)
    action = str(data.action).strip().upper()
    remark = (data.remark or "").strip()
    pr_no = data.pr_no

    if action == "A" and not remark:
        return {"status":"error","message":"Remark is mandatory for approve"}

    conn = get_conn()
    cursor = conn.cursor()

    def valid(code):
        normalized_code = normalize_emp_code(code)
        return normalized_code not in ("", "0")

    try:

        cursor.execute("""
        SELECT 
        MANAGER_CODE,SR_MANAGER_CODE,PMC_CODE,PI_CODE,
        AC_CODE,AD_CODE,DIR_CODE,PD_CODE,
        PURCHASE_HEAD_CODE,MATERIAL_HEAD_CODE,FINAL_DG_CODE,
        MANAGER_APR,SR_MANAGER_APR,PMC_APR,
        PI_APR,AC_APR,AD_APR,DIR_APR,PD_APR,
        PURCHASE_HEAD_APR,MATERIAL_HEAD_APR,FINAL_DG_APR
        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID=:1
        """,[req_id])

        row = cursor.fetchone()

        if not row:
            return {"status":"error","message":"Invalid Request"}

        role=None

        if normalize_emp_code(row[0]) == empcode and is_pending(row[11]):
            role="MANAGER"

        elif normalize_emp_code(row[1]) == empcode and is_pending(row[12]):
            role="SR_MANAGER"

        elif normalize_emp_code(row[2]) == empcode and is_pending(row[13]):
            role="PMC"

        elif normalize_emp_code(row[3]) == empcode and is_pending(row[14]):
            role="PI"

        elif normalize_emp_code(row[4]) == empcode and is_pending(row[15]):
            role="AC"

        elif normalize_emp_code(row[5]) == empcode and is_pending(row[16]):
            role="AD"

        elif normalize_emp_code(row[6]) == empcode and is_pending(row[17]):
            role="DIR"

        elif normalize_emp_code(row[7]) == empcode and is_pending(row[18]):
            role="PD"

        elif normalize_emp_code(row[8]) == empcode and is_pending(row[19]):
            role="PURCHASE_HEAD"

        elif normalize_emp_code(row[9]) == empcode and is_pending(row[20]):
            role="MATERIAL_HEAD"

        elif normalize_emp_code(row[10]) == empcode and is_pending(row[21]):
            role="FINAL_DG"

        if not role:
            return {"status":"error","message":"You are not authorized for this pending stage"}

        # ================= APPROVE =================
        if action=="A":

            if role=="MANAGER":

                cursor.execute("""
                UPDATE DMS_REQUISITION_MASTER
                SET MANAGER_APR='A',
                    MANAGER_APR_DATE=SYSDATE,
                    MANAGER_REMARK=:1,
                    SR_MANAGER_APR='P'
                WHERE REQ_ID=:2
                """,[remark,req_id])


            elif role=="SR_MANAGER":

                cursor.execute("""
                UPDATE DMS_REQUISITION_MASTER
                SET SR_MANAGER_APR='A',
                    SR_MANAGER_APR_DATE=SYSDATE,
                    SR_MANAGER_REMARK=:1,
                    PMC_APR='P'
                WHERE REQ_ID=:2
                """,[remark,req_id])


            elif role=="PMC":

                cursor.execute("""
                SELECT PROJECT_CODE
                FROM DMS_REQUISITION_MASTER
                WHERE REQ_ID=:1
                """,[req_id])

                project_code = cursor.fetchone()[0]

                cursor.execute("""
                SELECT PI_CODE,AC_CODE,AD_CODE,DIR_CODE,PD_CODE
                FROM PIApprovalMatrix
                WHERE PROJECT_CODE=:1
                """,[project_code])

                pi,ac,ad,dirc,pd = cursor.fetchone()

                
                pi = str(pi)
                ac = str(ac)
                ad = str(ad)
                dirc = str(dirc)
                pd = str(pd)

                # PI = AC
                if pi == ac and valid(ac):

                    next_field = "AC_APR"
                    next_code = ac
                    next_code_field = "AC_CODE"

                # PI = AD
                elif pi == ad and valid(ad):

                    next_field = "AD_APR"
                    next_code = ad
                    next_code_field = "AD_CODE"

                # PI = DIR
                elif pi == dirc and valid(dirc):

                    next_field = "DIR_APR"
                    next_code = dirc
                    next_code_field = "DIR_CODE"

                # PI = PD
                elif pi == pd and valid(pd):

                    next_field = "PD_APR"
                    next_code = pd
                    next_code_field = "PD_CODE"

                # Normal case
                else:

                    next_field = "PI_APR"
                    next_code = pi
                    next_code_field = "PI_CODE"


                cursor.execute(f"""
                UPDATE DMS_REQUISITION_MASTER
                SET PMC_APR='A',
                    PMC_APR_DATE=SYSDATE,
                    PMC_REMARK=:1,
                    {next_field}='P',
                    {next_code_field}=:2
                WHERE REQ_ID=:3
                """,[remark,next_code,req_id])


            elif role=="PI":

                cursor.execute("""
                SELECT PROJECT_CODE
                FROM DMS_REQUISITION_MASTER
                WHERE REQ_ID=:1
                """,[req_id])

                project_code=cursor.fetchone()[0]

                cursor.execute("""
                SELECT AC_CODE,AD_CODE,DIR_CODE,PD_CODE
                FROM PIApprovalMatrix
                WHERE PROJECT_CODE=:1
                """,[project_code])

                ac,ad,dirc,pd=cursor.fetchone()

                if valid(ac):
                    next_field="AC_APR"; next_code=ac; next_code_field="AC_CODE"

                elif valid(ad):
                    next_field="AD_APR"; next_code=ad; next_code_field="AD_CODE"

                elif valid(dirc):
                    next_field="DIR_APR"; next_code=dirc; next_code_field="DIR_CODE"

                elif valid(pd):
                    next_field="PD_APR"; next_code=pd; next_code_field="PD_CODE"

                else:
                    next_field="PURCHASE_HEAD_APR"; next_code="4474"; next_code_field="PURCHASE_HEAD_CODE"

                cursor.execute(f"""
                UPDATE DMS_REQUISITION_MASTER
                SET PI_APR='A',
                    PI_APR_DATE=SYSDATE,
                    PI_REMARKS=:1,
                    {next_field}='P',
                    {next_code_field}=:2
                WHERE REQ_ID=:3
                """,[remark,next_code,req_id])


            elif role=="AC":

                cursor.execute("""
                SELECT AD_CODE,DIR_CODE,PD_CODE
                FROM PIApprovalMatrix
                WHERE PROJECT_CODE=(
                SELECT PROJECT_CODE FROM DMS_REQUISITION_MASTER WHERE REQ_ID=:1)
                """,[req_id])

                ad,dirc,pd=cursor.fetchone()

                if valid(ad):
                    next_field="AD_APR"; next_code=ad; next_code_field="AD_CODE"

                elif valid(dirc):
                    next_field="DIR_APR"; next_code=dirc; next_code_field="DIR_CODE"

                elif valid(pd):
                    next_field="PD_APR"; next_code=pd; next_code_field="PD_CODE"

                else:
                    next_field="PURCHASE_HEAD_APR"; next_code="4474"; next_code_field="PURCHASE_HEAD_CODE"

                cursor.execute(f"""
                UPDATE DMS_REQUISITION_MASTER
                SET AC_APR='A',
                    AC_APR_DATE=SYSDATE,
                    AC_REMARKS=:1,
                    {next_field}='P',
                    {next_code_field}=:2
                WHERE REQ_ID=:3
                """,[remark,next_code,req_id])


            elif role=="AD":

                cursor.execute("""
                SELECT PI_CODE,DIR_CODE,PD_CODE
                FROM PIApprovalMatrix
                WHERE PROJECT_CODE=(
                SELECT PROJECT_CODE FROM DMS_REQUISITION_MASTER WHERE REQ_ID=:1)
                """,[req_id])

                pi,dirc,pd=cursor.fetchone()

                if str(pi).lstrip("0")==str(pd).lstrip("0") and valid(dirc):

                    next_field="DIR_APR"; next_code=dirc; next_code_field="DIR_CODE"

                elif valid(pd):

                    next_field="PD_APR"; next_code=pd; next_code_field="PD_CODE"

                else:

                    next_field="PURCHASE_HEAD_APR"; next_code="4474"; next_code_field="PURCHASE_HEAD_CODE"

                cursor.execute(f"""
                UPDATE DMS_REQUISITION_MASTER
                SET AD_APR='A',
                    AD_APR_DATE=SYSDATE,
                    AD_REMARKS=:1,
                    {next_field}='P',
                    {next_code_field}=:2
                WHERE REQ_ID=:3
                """,[remark,next_code,req_id])


            elif role=="DIR":

                cursor.execute("""
                SELECT PD_CODE
                FROM PIApprovalMatrix
                WHERE PROJECT_CODE=(
                SELECT PROJECT_CODE FROM DMS_REQUISITION_MASTER WHERE REQ_ID=:1)
                """,[req_id])

                pd=cursor.fetchone()[0]

                cursor.execute("""
                UPDATE DMS_REQUISITION_MASTER
                SET DIR_APR='A',
                    DIR_APR_DATE=SYSDATE,
                    DIR_REMARKS=:1,
                    PD_APR='P',
                    PD_CODE=:2
                WHERE REQ_ID=:3
                """,[remark,pd,req_id])


            elif role=="PD":

                cursor.execute("""
                UPDATE DMS_REQUISITION_MASTER
                SET PD_APR='A',
                    PD_APR_DATE=SYSDATE,
                    PD_REMARKS=:1,
                    PURCHASE_HEAD_APR='P'
                WHERE REQ_ID=:2
                """,[remark,req_id])


            elif role=="PURCHASE_HEAD":

                cursor.execute("""
                UPDATE DMS_REQUISITION_MASTER
                SET PURCHASE_HEAD_APR='A',
                    PURCHASE_HEAD_DATE=SYSDATE,
                    PURCHASE_HEAD_REMARKS=:1,
                    MATERIAL_HEAD_APR='P',
                    MATERIAL_HEAD_CODE='2384'
                WHERE REQ_ID=:2
                """,[remark,req_id])


            elif role=="MATERIAL_HEAD":

                cursor.execute("""
                SELECT TOTAL_AMOUNT FROM DMS_REQUISITION_MASTER WHERE REQ_ID=:1
                """,[req_id])

                amount=cursor.fetchone()[0]

                if amount>1000000:

                    cursor.execute("""
                    UPDATE DMS_REQUISITION_MASTER
                    SET MATERIAL_HEAD_APR='A',
                        MATERIAL_HEAD_APR_DATE=SYSDATE,
                        MATERIAL_HEAD_REMARKS=:1,
                        FINAL_DG_APR='P',
                        FINAL_DG_CODE='0024'
                    WHERE REQ_ID=:2
                    """,[remark,req_id])

                else:

                    cursor.execute("""
                    UPDATE DMS_REQUISITION_MASTER
                    SET MATERIAL_HEAD_APR='A',
                        MATERIAL_HEAD_APR_DATE=SYSDATE,
                        MATERIAL_HEAD_REMARKS=:1
                    WHERE REQ_ID=:2
                    """,[remark,req_id])


            elif role=="FINAL_DG":

                cursor.execute("""
                UPDATE DMS_REQUISITION_MASTER
                SET FINAL_DG_APR='A',
                    FINAL_DG_DATE=SYSDATE,
                    FINAL_DG_REMARK=:1
                WHERE REQ_ID=:2
                """,[remark,req_id])
                # ================= SENT BACK =================
        elif action == "S":

                    print("SENT BACK EXECUTED")

                    cursor.execute("""
                    UPDATE DMS_REQUISITION_MASTER
                    SET
                        STATUS='SENT_BACK',
                        SENT_BACK_FLAG='Y',
                        SENT_BACK_REMARK=:1,
                        SENT_BACK_DATE=SYSDATE,

                        MANAGER_APR=NULL,
                        SR_MANAGER_APR=NULL,
                        PMC_APR=NULL,
                        PI_APR=NULL,
                        AC_APR=NULL,
                        AD_APR=NULL,
                        DIR_APR=NULL,
                        PD_APR=NULL,
                        PURCHASE_HEAD_APR=NULL,
                        MATERIAL_HEAD_APR=NULL,
                        FINAL_DG_APR=NULL

                    WHERE REQ_ID=:2
                    """,[remark,req_id])


        

        # -------- LOG --------
        cursor.execute("""
        INSERT INTO DMS_APPROVAL_LOG
        (REQ_ID,PR_NO,ROLE,ACTION,REMARK,ACTION_DATE)
        VALUES(:1,:2,:3,:4,:5,SYSDATE)
        """,[req_id,pr_no,role,action,remark])

        conn.commit()

    except Exception as e:

        conn.rollback()
        print("ERROR:",e)

        return {"status":"error","message":str(e)}

    finally:

        cursor.close()
        conn.close()

    return {"status":"updated"}


#----Approval Details API-------

@app.get("/approval/details")
def approval_details(req_id: int):

    conn = get_conn()
    cursor = conn.cursor()

    # ================= HEADER =================
    cursor.execute("""
        SELECT 
        REQ_ID,
        PR_NO,
        PROJECT_CODE,
        DOCUMENT_TITLE,
        DESCRIPTION,
        TOTAL_AMOUNT,
        INITIATOR_REMARK,
        MAIN_DOC_URLS
        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID = :1
    """, [req_id])

    header = cursor.fetchone()

    if not header:
        return {"error": "Record not found"}

    main_doc_raw = normalize_db_value(header[7])
    if main_doc_raw:
        try:
            main_docs = json.loads(main_doc_raw)
        except Exception:
            main_docs = [main_doc_raw]
    else:
        main_docs = []

    # ================= VENDORS =================
    cursor.execute("""
        SELECT
        VENDOR_NAME,
        AMOUNT,
        VENDOR_RANKING,
        REMARKS,
        QUOTATION_DOC_URL
        FROM DMS_REQUISITION_VENDOR
        WHERE REQ_ID = :1
    """, [req_id])

    vendors = cursor.fetchall()

    # ================= APPROVAL HISTORY =================
    cursor.execute("""
        SELECT 
        ROLE,
        USER_NAME,
        REMARK
        FROM DMS_APPROVAL_LOG
        WHERE REQ_ID = :1
        ORDER BY ACTION_DATE
    """, [req_id])

    remarks = cursor.fetchall()

    role_user_fallback = {
        "MANAGER": "Ravi Kumar Kahlon",
        "SR_MANAGER": "Dickens Kumar",
        "PMC": "Jayakumar V K",
        "SYSTEM": "System"
    }

    def resolve_display_name(value):
        normalized_value = normalize_db_value(value)
        if normalized_value is None:
            return ""

        raw_text = str(normalized_value).strip()
        if raw_text in ("", "-", "None", "NULL"):
            return ""

        if raw_text.isdigit():
            cursor.execute("""
                SELECT USERNAME
                FROM DMS_USERS
                WHERE LPAD(TRIM(EMPCODE), 4, '0') = LPAD(TRIM(:1), 4, '0')
                FETCH FIRST 1 ROWS ONLY
            """, [raw_text])

            user_row = cursor.fetchone()
            if user_row and normalize_db_value(user_row[0]):
                return str(normalize_db_value(user_row[0])).strip()

        return raw_text

    project_code = normalize_db_value(header[2])
    if project_code:
        cursor.execute("""
            SELECT PI_NAME, AC, AD, DIR, PD
            FROM PIApprovalMatrix
            WHERE PROJECT_CODE = :1
        """, [project_code])

        matrix_row = cursor.fetchone()
        if matrix_row:
            role_user_fallback["PI"] = resolve_display_name(matrix_row[0])
            role_user_fallback["AC"] = resolve_display_name(matrix_row[1])
            role_user_fallback["AD"] = resolve_display_name(matrix_row[2])
            role_user_fallback["DIR"] = resolve_display_name(matrix_row[3])
            role_user_fallback["PD"] = resolve_display_name(matrix_row[4])

    cursor.close()
    conn.close()

    return {

        # ================= HEADER =================
        "header": {
            "req_id": header[0],
            "pr_no": header[1],
            "project_code": header[2],
            "title": header[3],
            "description": header[4],
            "amount": header[5],
            "initiator_remark": normalize_db_value(header[6]),
            "main_doc": main_docs
        },

        # ================= VENDOR LIST =================
        "vendors":[
            {
                "vendor_name": v[0],
                "amount": v[1],
                "vendor_ranking": v[2],
                "remark": normalize_db_value(v[3]),
                "quotation": normalize_db_value(v[4])
            }
            for v in vendors
        ],

        # ================= APPROVAL REMARKS =================
        "approval_history":[
            {
                "role": r[0],
                "user_name": (
                    str(normalize_db_value(r[1])).strip()
                    if normalize_db_value(r[1]) not in (None, "", "-", "None", "NULL")
                    else role_user_fallback.get(str(normalize_db_value(r[0]) or "").strip().upper(), "")
                ),
                "remark": normalize_db_value(r[2])
            }
            for r in remarks
        ]
    }
#-----APPROVAL DETAILS TIMELINE-----

@app.get("/approval/remarks")
def get_remarks(req_id: int):

    conn = get_conn()
    cursor = conn.cursor()

    # Step 1: Get project code
    cursor.execute("""
        SELECT PROJECT_CODE
        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID = :1
    """, [req_id])

    project_code = cursor.fetchone()[0]

    # Step 2: Get approver names
    cursor.execute("""
        SELECT 
            PI_NAME,
            AC,
            AD,
            DIR,
            PD
        FROM PIApprovalMatrix
        WHERE PROJECT_CODE = :1
    """, [project_code])

    matrix = cursor.fetchone()

    # Step 3: Get remarks + status
    cursor.execute("""
        SELECT 
            MANAGER_APR, MANAGER_REMARK, MANAGER_APR_DATE,
            SR_MANAGER_APR, SR_MANAGER_REMARK, SR_MANAGER_APR_DATE,
            PMC_APR, PMC_REMARK, PMC_APR_DATE,

            PI_APR, PI_REMARKS, PI_APR_DATE,
            AC_APR, AC_REMARKS, AC_APR_DATE,
            AD_APR, AD_REMARKS, AD_APR_DATE,
            DIR_APR, DIR_REMARKS, DIR_APR_DATE,
            PD_APR, PD_REMARKS, PD_APR_DATE,

            PURCHASE_HEAD_APR, PURCHASE_HEAD_REMARKS, PURCHASE_HEAD_DATE,
            MATERIAL_HEAD_APR, MATERIAL_HEAD_REMARKS, MATERIAL_HEAD_APR_DATE,
            FINAL_DG_APR, FINAL_DG_REMARK, FINAL_DG_DATE

        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID = :1
    """, [req_id])

    row = cursor.fetchone()

    def format_data(name, status, remark, date):
        return {
            "name": name,
            "status": status,
            "remark": remark,
            "date": date
        }

    return {
        "MANAGER": format_data("Manager - Mr Ravi Kumar Kahlon", row[0], row[1], row[2]),
        "SR_MANAGER": format_data("Senior Manager - Mr Dickens Kumar", row[3], row[4], row[5]),
        "PMC": format_data("Chief Manager-PMU - Mr Jayakumar V K", row[6], row[7], row[8]),

        "PI": format_data(matrix[0], row[9], row[10], row[11]),
        "AC": format_data(matrix[1], row[12], row[13], row[14]),
        "AD": format_data(matrix[2], row[15], row[16], row[17]),
        "DIR": format_data(matrix[3], row[18], row[19], row[20]),
        "PD": format_data(matrix[4], row[21], row[22], row[23]),

        "PURCHASE_HEAD": format_data("Purchase Head", row[24], row[25], row[26]),
        "MATERIAL_HEAD": format_data("MATERIAL_HEAD - Dr Dipankar Saharia ", row[27], row[28], row[29]),
        "FINAL_DG": format_data("FINAL_DG - Dr Vibha Dhawan", row[30], row[31], row[32])
    }

#-------END approval details timeline-------


@app.post("/login")
async def login(request: Request):

    data = await request.json()

    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT ROLE, EMPCODE
        FROM DMS_USERS
        WHERE USERNAME = :1
        AND PASSWORD = :2
    """,[username, password])

    row = cursor.fetchone()

    cursor.close()
    conn.close()

    if row:
        return {
            "status": "success",
            "username": username,
            "role": row[0],
            "empcode": row[1]
        }
    else:
        return {"status": "error", "message": "Invalid Credentials"}



#--------Initiator Requests API-------to check own requests raised by initiator----

@app.get("/initiator/requests")
def initiator_requests(empcode: str):

    normalized_empcode = normalize_identifier(empcode)

    if not normalized_empcode:
        return []

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
SELECT 
M.REQ_ID,
M.PR_NO,
M.PROJECT_CODE,
M.DOCUMENT_TITLE,
M.TOTAL_AMOUNT,

M.MANAGER_APR,
M.SR_MANAGER_APR,
M.PMC_APR,
M.PI_APR,
M.AC_APR,
M.AD_APR,
M.DIR_APR,
M.PD_APR,
M.PURCHASE_HEAD_APR,
M.MATERIAL_HEAD_APR,
M.FINAL_DG_APR,
M.STATUS,

A.PI_NAME,
A.AC,
A.AD,
A.DIR,
A.PD

FROM DMS_REQUISITION_MASTER M
LEFT JOIN PIApprovalMatrix A
ON M.PROJECT_CODE = A.PROJECT_CODE

WHERE (
    UPPER(TRIM(TO_CHAR(M.INITIATOR_CODE))) = UPPER(TRIM(:1))
    OR LPAD(TRIM(TO_CHAR(M.INITIATOR_CODE)), 4, '0') = LPAD(TRIM(:2), 4, '0')
)
AND (M.STATUS IS NULL OR UPPER(M.STATUS) != 'SENT_BACK')

ORDER BY M.CREATED_DATE DESC
""", [normalized_empcode, normalized_empcode])

    rows = cursor.fetchall()
     # ⭐ DEBUG PRINTS
    print("EMP CODE:", normalized_empcode)
    print("ROWS:", rows)

    data = []

    for r in rows:
        data.append({

            "req_id": r[0],
            "pr_no": r[1],
            "project_code": r[2],
            "title": r[3],
            "amount": r[4],

            "manager": r[5],
            "sr_manager": r[6],
            "pmc": r[7],
            "pi": r[8],
            "ac": r[9],
            "ad": r[10],
            "dir": r[11],
            "pd": r[12],
            "purchase_head": r[13],
            "material_head": r[14],
            "final_dg": r[15],

            "status": r[16],

            "pi_name": r[17],
            "ac_name": r[18],
            "ad_name": r[19],
            "dir_name": r[20],
            "pd_name": r[21]
        })

    cursor.close()
    conn.close()

    return data

#-------Remarks Show Api in approval page----------

@app.get("/purchase/{pr_no}")
def get_purchase(pr_no: str):

    conn = get_conn()
    cursor = conn.cursor()

    query = """
    SELECT 
        REQ_ID,
        PR_NO,
        PROJECT_CODE,
        DOCUMENT_TITLE,
        DESCRIPTION,
        TOTAL_AMOUNT,
        MANAGER_REMARK
    FROM DMS_REQUISITION_MASTER
    WHERE PR_NO = :1
    """

    cursor.execute(query, [pr_no])
    result = cursor.fetchone()

    cursor.close()
    conn.close()

    if result:
        return {
            "req_id": result[0],
            "pr_no": result[1],
            "project": result[2],
            "title": result[3],
            "description": result[4],
            "total": result[5],
            "manager_remark": result[6]
        }
    else:
        return {"error": "Record not found"}
    

@app.post("/approval/sent-back")
def sent_back(data: SentBackAction):

    req_id = data.req_id
    remark = data.remark or ""
    pr_no = data.pr_no

    conn = get_conn()
    cursor = conn.cursor()

    try:

        cursor.execute("""
        UPDATE DMS_REQUISITION_MASTER
        SET
            STATUS='SENT_BACK',
            SENT_BACK_REMARK=:1,
            SENT_BACK_DATE=SYSDATE,

            MANAGER_APR=NULL,
            SR_MANAGER_APR=NULL,
            PMC_APR=NULL,
            PI_APR=NULL,
            AC_APR=NULL,
            AD_APR=NULL,
            DIR_APR=NULL,
            PD_APR=NULL,
            PURCHASE_HEAD_APR=NULL,
            MATERIAL_HEAD_APR=NULL,
            FINAL_DG_APR=NULL

        WHERE REQ_ID=:2
        """,[remark,req_id])


        cursor.execute("""
        INSERT INTO DMS_APPROVAL_LOG
        (REQ_ID,PR_NO,ROLE,ACTION,REMARK,ACTION_DATE)
        VALUES(:1,:2,'SYSTEM','SENT_BACK',:3,SYSDATE)
        """,[req_id,pr_no,remark])


        conn.commit()

    except Exception as e:

        conn.rollback()
        return {"status":"error","message":str(e)}

    finally:

        cursor.close()
        conn.close()

    return {"status":"updated"}


@app.get("/initiator/sent-back")
def sent_back_cases(empcode: str):

    normalized_empcode = normalize_identifier(empcode)

    print("EMP CODE RECEIVED:", normalized_empcode)

    if not normalized_empcode:
        return []

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""

    SELECT
    REQ_ID,
    PROJECT_CODE,
    DOCUMENT_TITLE,
    TOTAL_AMOUNT,
    SENT_BACK_REMARK,
    SENT_BACK_DATE

    FROM DMS_REQUISITION_MASTER

    WHERE STATUS='SENT_BACK'
    AND (
        UPPER(TRIM(TO_CHAR(INITIATOR_CODE))) = UPPER(TRIM(:1))
        OR LPAD(TRIM(TO_CHAR(INITIATOR_CODE)), 4, '0') = LPAD(TRIM(:2), 4, '0')
    )

    ORDER BY SENT_BACK_DATE DESC

    """, [normalized_empcode, normalized_empcode])

    rows = cursor.fetchall()

    cursor.close()
    conn.close()

    return [

        {
            "req_id":r[0],
            "project_code":r[1],
            "title":r[2],
            "amount":r[3],
            "remark":r[4],
            "date":r[5]
        }

        for r in rows
    ]
#-------Resubmit API for sent back cases-------

@app.post("/initiator/resubmit")
def resubmit(req_id:int):

    conn=get_conn()
    cursor=conn.cursor()

    try:

        cursor.execute("""
        UPDATE DMS_REQUISITION_MASTER
        SET
            STATUS='SUBMITTED',

            SENT_BACK_REMARK=NULL,
            SENT_BACK_DATE=NULL,

            MANAGER_APR='P',
            SR_MANAGER_APR=NULL,
            PMC_APR=NULL,
            PI_APR=NULL,
            AC_APR=NULL,
            AD_APR=NULL,
            DIR_APR=NULL,
            PD_APR=NULL,
            PURCHASE_HEAD_APR=NULL,
            MATERIAL_HEAD_APR=NULL,
            FINAL_DG_APR=NULL

        WHERE REQ_ID=:1
        """,[req_id])

        conn.commit()

    except Exception as e:

        conn.rollback()
        return {"status":"error","message":str(e)}

    finally:

        cursor.close()
        conn.close()

    return {"status":"resubmitted"}

#-----end of resubmit API-------



#-------Request Details API for sent back cases-------

#-------Request Details API for sent back cases-------

@app.post("/resubmit_pr")
async def resubmit_pr(request: Request):

    content_type = (request.headers.get("content-type") or "").lower()

    if "application/json" in content_type:
        data = await request.json()
        form = None
    else:
        form = await request.form()
        data = dict(form)

    req_id = int(data.get("req_id"))
    pr_no = data.get("pr_no")
    project_code = data.get("project_code")
    document_title = data.get("document_title")
    description = data.get("description")
    total_amount = float(data.get("total_amount"))
    initiator_remark = data.get("initiator_remark") or ""
    initiator_code = normalize_identifier(
        data.get("initiator_code")
        or data.get("initiator_empcode")
        or data.get("empcode")
        or data.get("initiator")
    ) or None
    vendors = data.get("vendors")

    conn = get_conn()
    cursor = conn.cursor()

    try:

        # -------- GET OLD FILE --------
        cursor.execute("""
        SELECT MAIN_DOC_URLS FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID=:1
        """,[req_id])

        old_doc_row = cursor.fetchone()
        old_doc = old_doc_row[0] if old_doc_row else None
        if hasattr(old_doc, "read"):
            old_doc = old_doc.read()

        # -------- FILE HANDLING --------
        main_doc_urls = []

        if form:
            files = form.getlist("file")
        else:
            files = []

        
        if files:

            for file in files:

                content = file.file.read()
                ext = file.filename.split(".")[-1]

                new_name = f"{project_code}_Main_{len(main_doc_urls)+1}.{ext}"

                url = upload_to_sharepoint(content, new_name, project_code)

                main_doc_urls.append(url)

            main_doc_urls_json = json.dumps(main_doc_urls)

        else:
           
            main_doc_urls_json = old_doc


        # -------- UPDATE MASTER --------
        cursor.execute("""
        UPDATE DMS_REQUISITION_MASTER
        SET
            DOCUMENT_TITLE = :1,
            DESCRIPTION = :2,
            TOTAL_AMOUNT = :3,
            INITIATOR_REMARK = :4,
            MAIN_DOC_URLS = :5,
            INITIATOR_CODE = NVL(:6, INITIATOR_CODE),

            STATUS='SUBMITTED',
            SENT_BACK_FLAG='N',
            SENT_BACK_REMARK=NULL,
            SENT_BACK_DATE=NULL,

            MANAGER_APR='P',
            SR_MANAGER_APR=NULL,
            PMC_APR=NULL,
            PI_APR=NULL,
            AC_APR=NULL,
            AD_APR=NULL,
            DIR_APR=NULL,
            PD_APR=NULL,
            PURCHASE_HEAD_APR=NULL,
            MATERIAL_HEAD_APR=NULL,
            FINAL_DG_APR=NULL

        WHERE REQ_ID = :7
        """,[
            document_title,
            description,
            total_amount,
            initiator_remark,
            main_doc_urls_json,
            initiator_code,
            req_id
        ])


        # -------- DELETE OLD VENDORS --------
        cursor.execute("""
        DELETE FROM DMS_REQUISITION_VENDOR
        WHERE REQ_ID = :1
        """,[req_id])


        # -------- PARSE VENDORS --------
        if not vendors:
            vendor_list = []
        elif isinstance(vendors, str):
            vendor_list = json.loads(vendors)
        else:
            vendor_list = vendors


        # -------- INSERT NEW VENDORS --------
        for i, v in enumerate(vendor_list):

            quotation_url = v.get("quotation_url") or v.get("quotation")

            if form:
                q_key = f"quotation_{i}"
                if q_key in form and getattr(form[q_key], "filename", None):
                    qfile = form[q_key]
                    content = qfile.file.read()
                    ext = qfile.filename.split(".")[-1]
                    new_vendor_name = f"{project_code}_VENDOR{i+1}.{ext}"
                    quotation_url = upload_to_sharepoint(content, new_vendor_name, project_code)

            cursor.execute("""
            INSERT INTO DMS_REQUISITION_VENDOR
            (REQ_ID,VENDOR_NAME,AMOUNT,VENDOR_RANKING,REMARKS,QUOTATION_DOC_URL)
            VALUES
            (:1,:2,:3,:4,:5,:6)
            """,[
                req_id,
                v["vendor_name"],
                v["amount"],
                v["vendor_ranking"],
                v["remark"],
                quotation_url
            ])


        # -------- LOG --------
        cursor.execute("""
        INSERT INTO DMS_APPROVAL_LOG
        (REQ_ID,PR_NO,ROLE,ACTION,REMARK,ACTION_DATE)
        VALUES(:1,:2,'INITIATOR','RESUBMIT',:3,SYSDATE)
        """,[req_id,pr_no,initiator_remark])


        conn.commit()

    except Exception as e:

        conn.rollback()
        return {"status":"error","message":str(e)}

    finally:

        cursor.close()
        conn.close()

    return {"status":"resubmitted"}
#-------end of Request Details API for sent back cases-------




@app.get("/request/details")
def request_details(req_id: int):

    conn = get_conn()
    cursor = conn.cursor()

    # Header
    cursor.execute("""
        SELECT 
        REQ_ID,
        PR_NO,
        PROJECT_CODE,
        DOCUMENT_TITLE,
        DESCRIPTION,
        TOTAL_AMOUNT
        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID = :1
    """,[req_id])

    header = cursor.fetchone()

    if not header:
        return {"error": "Record not found"}

    # Vendors
    cursor.execute("""
        SELECT
        VENDOR_NAME,
        AMOUNT,
        VENDOR_RANKING,
        REMARKS,
        QUOTATION_DOC_URL
        FROM DMS_REQUISITION_VENDOR
        WHERE REQ_ID = :1
    """,[req_id])

    vendors = cursor.fetchall()

    cursor.close()
    conn.close()

    return {
        "header": {
            "req_id": header[0],
            "pr_no": header[1],
            "project_code": header[2],
            "title": header[3],
            "description": header[4],
            "amount": header[5]
        },

        "vendors":[
            {
                "vendor_name": v[0],
                "amount": v[1],
                "vendor_ranking": v[2],
                "remark": v[3],
                "quotation_url": v[4]
            }
            for v in vendors
        ]
    }


@app.get("/matrix/{project_code}")
def get_matrix(project_code: str):

    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT
    PI_CODE,
    AC_CODE,
    AD_CODE,
    DIR_CODE,
    PD_CODE
    FROM PIApprovalMatrix
    WHERE PROJECT_CODE = :1
    """,[project_code])

    row = cursor.fetchone()

    cursor.close()
    conn.close()

    if not row:
        return {"error":"Matrix not found"}

    return {
        "pi": row[0],
        "ac": row[1],
        "ad": row[2],
        "dir": row[3],
        "pd": row[4]
    }


@app.post("/approval/reject")
def reject_request(data: ApprovalAction):

    req_id = data.req_id
    empcode = str(data.empcode).strip()
    remark = data.remark or ""
    pr_no = data.pr_no

    conn = get_conn()
    cursor = conn.cursor()

    try:

        cursor.execute("""
        SELECT 
        MANAGER_CODE,
        SR_MANAGER_CODE,
        PMC_CODE,
        PI_CODE,
        AC_CODE,
        AD_CODE,
        DIR_CODE,
        PD_CODE,
        PURCHASE_HEAD_CODE,
        MATERIAL_HEAD_CODE,
        FINAL_DG_CODE
        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID=:1
        """,[req_id])

        row = cursor.fetchone()

        if not row:
            return {"status":"error","message":"Invalid Request"}

        role=None

        if str(row[0]).zfill(4) == empcode:
            role="MANAGER"

        elif str(row[1]).zfill(4) == empcode:
            role="SR_MANAGER"

        elif str(row[2]).zfill(4) == empcode:
            role="PMC"

        elif str(row[3]).zfill(4) == empcode:
            role="PI"

        elif str(row[4]).zfill(4) == empcode:
            role="AC"

        elif str(row[5]).zfill(4) == empcode:
            role="AD"

        elif str(row[6]).zfill(4) == empcode:
            role="DIR"

        elif str(row[7]).zfill(4) == empcode:
            role="PD"

        elif str(row[8]).zfill(4) == empcode:
            role="PURCHASE_HEAD"

        elif str(row[9]).zfill(4) == empcode:
            role="MATERIAL_HEAD"

        elif str(row[10]).zfill(4) == empcode:
            role="FINAL_DG"

        if not role:
            return {"status":"error","message":"You are not authorized"}

        role_map={
            "MANAGER":("MANAGER_APR","MANAGER_REMARK"),
            "SR_MANAGER":("SR_MANAGER_APR","SR_MANAGER_REMARK"),
            "PMC":("PMC_APR","PMC_REMARK"),
            "PI":("PI_APR","PI_REMARKS"),
            "AC":("AC_APR","AC_REMARKS"),
            "AD":("AD_APR","AD_REMARKS"),
            "DIR":("DIR_APR","DIR_REMARKS"),
            "PD":("PD_APR","PD_REMARKS"),
            "PURCHASE_HEAD":("PURCHASE_HEAD_APR","PURCHASE_HEAD_REMARKS"),
            "MATERIAL_HEAD":("MATERIAL_HEAD_APR","MATERIAL_HEAD_REMARKS"),
            "FINAL_DG":("FINAL_DG_APR","FINAL_DG_REMARK")
        }

        apr_col,remark_col=role_map[role]

        cursor.execute(f"""
        UPDATE DMS_REQUISITION_MASTER
        SET STATUS='REJECTED',
            {apr_col}='R',
            {remark_col}=:1
        WHERE REQ_ID=:2
        """,[remark,req_id])


        cursor.execute("""
        INSERT INTO DMS_APPROVAL_LOG
        (REQ_ID,PR_NO,ROLE,ACTION,REMARK,ACTION_DATE)
        VALUES(:1,:2,:3,'R',:4,SYSDATE)
        """,[req_id,pr_no,role,remark])


        conn.commit()

    except Exception as e:

        conn.rollback()
        print("ERROR:",e)
        return {"status":"error","message":str(e)}

    finally:

        cursor.close()
        conn.close()

    return {"status":"updated"}


@app.post("/approval/query")
async def raise_query(request: Request):

    data = await request.json()

    req_id = data.get("req_id")
    role = data.get("role")
    empcode = data.get("emp_code")
    query_text = data.get("query")

    conn = get_conn()
    cursor = conn.cursor()

    #  Initiator find
    cursor.execute("""
    SELECT INITIATOR_CODE
    FROM DMS_REQUISITION_MASTER
    WHERE REQ_ID=:1
    """,[req_id])

    initiator = cursor.fetchone()[0]

    #  Insert Query
    cursor.execute("""
    INSERT INTO DMS_APPROVAL_QUERY
    (REQ_ID, FROM_ROLE, FROM_EMPCODE, TO_EMPCODE, QUERY_TEXT, STATUS)
    VALUES (:1,:2,:3,:4,:5,'OPEN')
    """,[req_id, role, empcode, initiator, query_text])

    #  Notification
    cursor.execute("""
    INSERT INTO DMS_NOTIFICATION (EMP_CODE, MESSAGE)
    VALUES (:1, :2)
    """,[initiator, f"Query raised for REQ {req_id}"])

    conn.commit()

    return {"status":"query_raised"}

@app.get("/initiator/queries")
def get_initiator_queries(empcode: str):

    conn = get_conn()
    cursor = conn.cursor()

    try:
        cursor.execute("""
        SELECT
            req_id,
            project_code,
            query_text,
            created_date
        FROM (
            SELECT
                q.REQ_ID AS req_id,
                r.PROJECT_CODE AS project_code,
                q.QUERY_TEXT AS query_text,
                q.CREATED_DATE AS created_date,
                ROW_NUMBER() OVER (
                    PARTITION BY q.REQ_ID
                    ORDER BY q.CREATED_DATE DESC
                ) AS rn
            FROM DMS_APPROVAL_QUERY q
            JOIN DMS_REQUISITION_MASTER r
              ON r.REQ_ID = q.REQ_ID
            WHERE LPAD(TRIM(q.TO_EMPCODE), 4, '0') = LPAD(TRIM(:1), 4, '0')
        )
        WHERE rn = 1
        ORDER BY created_date DESC
        """, [empcode])

        rows = cursor.fetchall()

        return [
            {
                "req_id": r[0],
                "project_code": r[1],
                "query": normalize_db_value(r[2]),
                "date": r[3]
            }
            for r in rows
        ]
    finally:
        cursor.close()
        conn.close()


@app.get("/approval/query-thread")
def get_query_thread(req_id: int):

    conn = get_conn()
    cursor = conn.cursor()

    try:
        def normalize_emp_code(value):
            parsed_value = normalize_db_value(value)
            if parsed_value is None:
                return ""
            return str(parsed_value).strip().zfill(4)

        cursor.execute("""
        SELECT
            INITIATOR_CODE,
            MANAGER_CODE,
            SR_MANAGER_CODE,
            PMC_CODE,
            PI_CODE,
            AC_CODE,
            AD_CODE,
            DIR_CODE,
            PD_CODE,
            PURCHASE_HEAD_CODE,
            MATERIAL_HEAD_CODE,
            FINAL_DG_CODE
        FROM DMS_REQUISITION_MASTER
        WHERE REQ_ID = :1
        """, [req_id])

        requisition_codes = cursor.fetchone()

        role_by_code = {}
        if requisition_codes:
            role_pairs = [
                (requisition_codes[0], "INITIATOR"),
                (requisition_codes[1], "MANAGER"),
                (requisition_codes[2], "SR_MANAGER"),
                (requisition_codes[3], "PMC"),
                (requisition_codes[4], "PI"),
                (requisition_codes[5], "AC"),
                (requisition_codes[6], "AD"),
                (requisition_codes[7], "DIR"),
                (requisition_codes[8], "PD"),
                (requisition_codes[9], "PURCHASE_HEAD"),
                (requisition_codes[10], "MATERIAL_HEAD"),
                (requisition_codes[11], "FINAL_DG")
            ]

            for code, role in role_pairs:
                normalized_code = normalize_emp_code(code)
                if normalized_code:
                    role_by_code[normalized_code] = role

        cursor.execute("""
        SELECT
            q.FROM_ROLE,
            q.FROM_EMPCODE,
            q.TO_EMPCODE,
            q.QUERY_TEXT,
            q.STATUS,
            q.CREATED_DATE,
            (
                SELECT u.USERNAME
                FROM DMS_USERS u
                WHERE LPAD(TRIM(u.EMPCODE), 4, '0') = LPAD(TRIM(q.FROM_EMPCODE), 4, '0')
                FETCH FIRST 1 ROWS ONLY
            ) AS FROM_NAME,
            (
                SELECT u.USERNAME
                FROM DMS_USERS u
                WHERE LPAD(TRIM(u.EMPCODE), 4, '0') = LPAD(TRIM(q.TO_EMPCODE), 4, '0')
                FETCH FIRST 1 ROWS ONLY
            ) AS TO_NAME
        FROM DMS_APPROVAL_QUERY q
        WHERE REQ_ID = :1
        ORDER BY q.CREATED_DATE
        """, [req_id])

        rows = cursor.fetchall()

        thread = [
            {
                "from_role": normalize_db_value(r[0]) or role_by_code.get(normalize_emp_code(r[1])),
                "from_empcode": normalize_emp_code(r[1]),
                "to_role": role_by_code.get(normalize_emp_code(r[2])),
                "to_empcode": normalize_emp_code(r[2]),
                "query": normalize_db_value(r[3]),
                "status": r[4],
                "date": r[5],
                "from_name": normalize_db_value(r[6]),
                "to_name": normalize_db_value(r[7])
            }
            for r in rows
        ]

        return thread

    finally:
        cursor.close()
        conn.close()

@app.post("/approval/query-reply")
async def reply_query(request: Request):

    data = await request.json()

    req_id = data.get("req_id")
    reply = data.get("query")
    empcode = data.get("emp_code")

    conn = get_conn()
    cursor = conn.cursor()

    

    cursor.execute("""
    SELECT FROM_EMPCODE
    FROM DMS_APPROVAL_QUERY
    WHERE REQ_ID=:1 AND STATUS='OPEN'
    ORDER BY CREATED_DATE DESC
    FETCH FIRST 1 ROWS ONLY
    """,[req_id])

    approver = cursor.fetchone()[0]

    #  Insert reply
    cursor.execute("""
    INSERT INTO DMS_APPROVAL_QUERY
    (REQ_ID, FROM_ROLE, FROM_EMPCODE, TO_EMPCODE, QUERY_TEXT, STATUS)
    VALUES (:1,'INITIATOR',:2,:3,:4,'CLOSED')
    """,[req_id, empcode, approver, reply])

    #  Notification
    cursor.execute("""
    INSERT INTO DMS_NOTIFICATION (EMP_CODE, MESSAGE)
    VALUES (:1, :2)
    """,[approver, f"Query replied for REQ {req_id}"])

    conn.commit()

    return {"status":"replied"}

