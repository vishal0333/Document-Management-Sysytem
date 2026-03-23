import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Input, Button, Upload, Table, Select, InputNumber, Card } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import API from "../api/api";

const { Option } = Select;

export default function PurchaseCreate() {

const { req_id } = useParams();
const navigate = useNavigate();

const [prNo, setPrNo] = useState("");
const [prList, setPrList] = useState([]);
const [projectCode, setProjectCode] = useState("");
const [document_title, setdocument_title] = useState("");
const [description, setDescription] = useState("");
const [vendors, setVendors] = useState([]);
const [vendorMaster, setVendorMaster] = useState([]);
const [file, setFile] = useState([]);
const [initiatorRemark, setInitiatorRemark] = useState("");


// -------- LOAD INITIAL DATA --------
useEffect(() => {

async function loadInitial(){

  try{

    const pr = await API.get("/get_prno");
    setPrList(pr.data);

    const vendors = await API.get("/vendors");
    setVendorMaster(vendors.data);

    // EDIT MODE
    if(req_id){

      const res = await API.get(`/request/details?req_id=${req_id}`);

      setPrNo(res.data.header.pr_no || "");
      setProjectCode(res.data.header.project_code);
      setdocument_title(res.data.header.title);
      setDescription(res.data.header.description);

      const vendorRows = res.data.vendors.map(v => ({
        key: Date.now()+Math.random(),
        vendor_name: v.vendor_name,
        amount: v.amount,
        ranking: v.vendor_ranking,
        quotation: null,
        quotation_url: v.quotation_url || null,
        remark: v.remark
      }));

      setVendors(vendorRows);

    }

  }catch{
    console.log("API error");
  }

}

loadInitial();

},[req_id]);


// -------- FETCH PROJECT --------
const fetchProject = async (selectedPR) => {

try{

  const res = await API.get(`/get_project?pr_no=${selectedPR}`);
  setProjectCode(res.data.project_code);

}catch{

  console.log("Project fetch failed");

}

};


// -------- ADD VENDOR --------
const addRow = () => {

setVendors([
  ...vendors,
  {
    key: Date.now(),
    vendor_name:"",
    amount:0,
    ranking:"",
    quotation:null,
    remark:""
  }
]);

};


// -------- UPDATE GRID --------
const updateRow = (key,field,value) => {

const updated = vendors.map(v =>
  v.key===key ? {...v,[field]:value} : v
);

setVendors(updated);

};


// -------- DELETE ROW --------
const deleteRow = key => {

setVendors(vendors.filter(v=>v.key!==key));

};


// -------- TOTAL AMOUNT --------
const totalAmount = vendors.reduce((a,b)=>a + (Number(b.amount) || 0),0);


// -------- SUBMIT --------
const submitData = async () => {

if(!projectCode){
  alert("Project Code is required");
  return;
}

if(!document_title){
  alert("Document Title is required");
  return;
}

if(!description){
  alert("Description is required");
  return;
}

if(!file && !req_id){
  alert("Main Document is required");
  return;
}

if(vendors.length===0){
  alert("Add at least one vendor");
  return;
}

const formData = new FormData();
const empcode = localStorage.getItem("empcode");
const username = localStorage.getItem("username");
const initiatorCode = String(empcode || username || "").trim();

if(!initiatorCode){
  alert("Session expired. Please login again.");
  return;
}

formData.append("pr_no", prNo || "");
formData.append("project_code", projectCode);
formData.append("document_title", document_title);
formData.append("description", description);
formData.append("total_amount", totalAmount);
formData.append("initiator_remark", initiatorRemark);
formData.append("initiator_empcode", initiatorCode);
formData.append("initiator_code", initiatorCode);

// clean vendors
const cleanVendors = vendors.map(v=>({
  vendor_name:v.vendor_name,
  amount:v.amount,
  vendor_ranking:v.ranking,
  remark:v.remark,
  quotation:v.quotation_url || null
}));

formData.append("vendors", JSON.stringify(cleanVendors));

vendors.forEach((v,i)=>{
  if(v.quotation){
    formData.append(`quotation_${i}`, v.quotation);
  }
});

if(file){
  file.forEach((f)=>{
formData.append("file", f);
});
}

try{

if(req_id){

  formData.append("req_id", req_id);

  await API.post("/resubmit_pr", formData);

  alert("Resubmitted Successfully");

}else{

  await API.post("/submit_pr", formData);

  alert("Submitted Successfully");

}

navigate("/my-requests");

}catch(e){

  console.log(e);
  alert("Submission Failed");

}

};


// -------- TABLE COLUMNS --------
const columns = [

{
title:"Vendor Name",
render:(_,record)=>(
<Select
showSearch
value={record.vendor_name}
style={{width:200}}
onChange={v=>updateRow(record.key,"vendor_name",v)}
>
{vendorMaster.map((v,i)=>(
<Option key={i} value={v.vendor_name}>
{v.vendor_name}
</Option>
))}
</Select>
)
},

{
title:"Amount",
render:(_,record)=>(
<InputNumber
value={record.amount}
onChange={v=>updateRow(record.key,"amount",v)}
/>
)
},

{
title:"Ranking",
render:(_,record)=>(
<Select
style={{width:100}}
value={record.ranking}
onChange={v=>updateRow(record.key,"ranking",v)}
>
{[...Array(10)].map((_,i)=>(
<Option key={i+1} value={`L${i+1}`}>
{`L${i+1}`}
</Option>
))}
</Select>
)
},

{
title:"Remarks",
render:(_,record)=>(
<Input
value={record.remark}
onChange={e=>updateRow(record.key,"remark",e.target.value)}
/>
)
},

{
title:"Quotation",
render:(_,record)=>(
<Upload
beforeUpload={file=>{
updateRow(record.key,"quotation",file);
return false;
}}
>
<Button icon={<UploadOutlined />} type="primary" style={{background:"#22c55e", backgroundColor:"#22c55e"}}>Upload</Button>
</Upload>
)
},

{
title:"Action",
render:(_,record)=>(
<Button danger onClick={()=>deleteRow(record.key)}>
Delete
</Button>
)
}

];


// -------- UI --------
return (

<div
  style={{
    minHeight: "100vh",
    padding: "8px 40px 32px",
    background:
      "linear-gradient(135deg,#dbeafe 0%, #e0f2fe 40%, #f0fdf4 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start"
  }}
>

<Card
  style={{
    width: "100%",
    maxWidth: 1100,
    borderRadius: 18,
    border: "none",
    background: "#ffffff",
    boxShadow: "0 15px 40px rgba(0,0,0,0.12)",
    padding: 20
  }}
>

<h2 style={{fontWeight:700,color:"#1e293b",marginBottom:25}}>
🚀 Create Purchase Request
</h2>


{/* PR NO */}
<p style={{fontWeight:600}}>PR No (Optional)</p>

<Select
showSearch
allowClear
style={{width:300}}
value={prNo||undefined}
onChange={value=>{
setPrNo(value);
fetchProject(value);
}}
>
{prList.map((p,i)=>(
<Option key={i} value={p.pr_no||""}>
{p.pr_no}
</Option>
))}
</Select>

<br/><br/>


{/* PROJECT CODE */}
<p style={{fontWeight:600}}>Project Code *</p>

<Input
value={projectCode}
onChange={e=>setProjectCode(e.target.value)}
style={{width:300}}
/>

<br/><br/>


{/* DOCUMENT TITLE */}
<p style={{fontWeight:600}}>Document Title</p>

<Input
value={document_title}
onChange={e=>setdocument_title(e.target.value)}
style={{width:450}}
/>

<br/><br/>


{/* DESCRIPTION */}
<p style={{fontWeight:600}}>Description</p>

<Input.TextArea
rows={3}
value={description}
onChange={e=>setDescription(e.target.value)}
style={{width:650}}
/>

<br/><br/>


{/* FILE UPLOAD */}
<p style={{fontWeight:600}}>Main Document Upload</p>

<Upload
multiple
beforeUpload={(file)=>{
setFile(prev=>[...prev,file]);
return false;
}}
fileList={file}
onRemove={(file)=>{
setFile(prev=>prev.filter(f=>f.uid!==file.uid))
}}
>

<Button
icon={<UploadOutlined />}
type="primary"
style={{
background:"#22c55e",
borderColor:"#22c55e",
fontWeight:"bold"
}}
>
Upload
</Button>

</Upload>

<br/><br/>


{/* ADD VENDOR */}
<Button
type="primary"
style={{
background:"#22c55e",
borderColor:"#22c55e",
fontWeight:"bold"
}}
onClick={addRow}
>
+ Add Vendor
</Button>


<Table
columns={columns}
dataSource={vendors}
pagination={false}
style={{
marginTop:20,
background:"#ffffff",
borderRadius:10
}}
/>


{/* TOTAL */}
<div
style={{
fontSize:20,
fontWeight:700,
marginTop:20,
padding:"10px 18px",
borderRadius:10,
background:"#f1f5f9",
display:"inline-block"
}}
>
Total Amount: ₹ {totalAmount}
</div>


<br/><br/>


{/* INITIATOR REMARK */}
<div
style={{
background:"#f8fafc",
padding:18,
borderRadius:12,
border:"1px solid #e5e7eb"
}}
>

<h3 style={{color:"#f59e0b",marginBottom:10}}>
📝 Initiator Remark
</h3>

<Input.TextArea
rows={3}
onChange={e=>setInitiatorRemark(e.target.value)}
/>

</div>


<br/>


{/* SUBMIT */}
<Button
type="primary"
size="large"
style={{
background:"linear-gradient(90deg,#3b82f6,#06b6d4)",
border:"none",
fontWeight:"bold",
padding:"0 35px",
height:44,
borderRadius:10
}}
onClick={submitData}
>
Submit Request
</Button>


</Card>

</div>

);

}
