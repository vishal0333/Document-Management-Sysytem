import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import API from "../api/api";
import { Card, Table, Button } from "antd";
import { FileOutlined } from "@ant-design/icons";
import { Modal } from "antd";

function RequestDetails() {

const { reqid } = useParams();
const [data, setData] = useState(null);
const [remarks, setRemarks] = useState(null);
const [open, setOpen] = useState(false);


// useEffect(() => {
//   API.get(`/approval/details?req_id=${reqid}`)
//     .then(res => setData(res.data));
//     console.log("REQ ID:", reqid);
// }, [reqid]);

useEffect(() => {
  API.get(`/approval/details?req_id=${reqid}`)
    .then(res => setData(res.data));

  API.get(`/approval/remarks?req_id=${reqid}`)
    .then(res => setRemarks(res.data));

  console.log("REQ ID:", reqid);
}, [reqid]);

if (!data) return <div>Loading...</div>;

return (
  <div style={{ padding: 20 }}>
    <Card>

      <p><b>Project:</b> {data.header.project_code}</p>
      <p><b>Title:</b> {data.header.title}</p>
      <p><b>Description:</b> {data.header.description}</p>
      <p><b>Amount:</b> ₹ {data.header.amount}</p>
      <p><b>Initiator Remark:</b> {data.header.initiator_remark || "-"}</p>
      


      <p>
<div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
 {data.header.main_doc && data.header.main_doc.length > 0 ? (

                        data.header.main_doc.map((doc, index) => (

                          <button
                            key={index}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-1 rounded-md shadow-md transition"
                            onClick={() =>
                              window.open(`https://teriindia.sharepoint.com${doc}`, "_blank")
                            }
                          >
                            Download Document {index + 1}
                          </button>

                        ))

                      ) : (

                        <span style={{ color: "gray" }}>No Document</span>

                      )}



<button
      className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded-md shadow-md ml-2"
      onClick={() => setOpen(true)}
      style={{ marginLeft: "10px" }}
    >
      View Remarks
</button>

</div>
</p>
        <br></br>
      <Table
        columns={[
          { title: "Vendor Name", dataIndex: "vendor_name" },
          { title: "Amount", dataIndex: "amount" },
          { title: "Vendor Ranking", dataIndex: "vendor_ranking" },
          {
            title: "Quotation",
            render: (_, record) => (
              <button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-1 rounded-md shadow-md transition" 
                onClick={() => window.open(`https://teriindia.sharepoint.com${record.quotation}`, "_blank")}>
                View
                  </button>
            )
          }
        ]}
        dataSource={data.vendors}
        rowKey="vendor_name"
      />

   <Modal
  title="Approval Remarks"
  open={open}
  onCancel={() => setOpen(false)}
  footer={null}
>
 {remarks ? (
  Object.entries(remarks)
    // ✅ Only approved ya current pending step
    .filter(([, data]) => data.status === "A" || data.status === "P")
    .map(([role, data]) => {

      const isApproved = data.status === "A";

      return (
        <div
          key={role}
          style={{
            marginBottom: "12px",
            padding: "10px",
            borderLeft: `5px solid ${isApproved ? "green" : "gray"}`,
            background: isApproved ? "#f6ffed" : "#f5f5f5",
            borderRadius: "6px"
          }}
        >
          {/* Role Badge */}
         <span style={{
            background: isApproved ? "green" : "gray",
            color: "white",
            padding: "2px 10px",
            borderRadius: "12px",
            fontSize: "12px"
          }}>
            {data.name || role}
          </span>

          <div style={{ marginTop: "5px" }}>
            <b>Status:</b> {isApproved ? "Approved" : "Pending"} <br />

            {/* Only show remark if approved */}
            {isApproved && (
              <>
                <b>Remark:</b> {data.remark || "-"} <br />
                <b>Date:</b> {data.date || "-"}
              </>
            )}
          </div>
        </div>
      );
    })
) : (
  <p>Loading...</p>
)}
</Modal>







    </Card>
  </div>
);
}

export default RequestDetails;