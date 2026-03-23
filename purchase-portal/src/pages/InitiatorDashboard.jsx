import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Tag, Button, Card, Space, Typography, message } from "antd";
import { EyeOutlined, ReloadOutlined, FileDoneOutlined } from "@ant-design/icons";
import API from "../api/api";
import { useNavigate } from "react-router-dom";

function InitiatorDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const empcode = localStorage.getItem("empcode") || "";
  const username = localStorage.getItem("username") || "";

  const createIdentifierVariants = (value) => {
    const raw = String(value || "").trim();
    if (!raw) {
      return [];
    }

    const variants = [raw, raw.toUpperCase(), raw.toLowerCase()];
    const digitsOnly = raw.replace(/\D/g, "");

    if (digitsOnly) {
      variants.push(digitsOnly);
      variants.push(digitsOnly.padStart(4, "0"));
      variants.push(digitsOnly.padStart(5, "0"));
      variants.push(String(Number(digitsOnly)));
    }

    return [...new Set(variants.filter((item) => String(item).trim() !== ""))];
  };

  const requestIdentifiers = useMemo(() => {
    const ids = [...createIdentifierVariants(empcode), ...createIdentifierVariants(username)];

    return [...new Set(ids)];
  }, [empcode, username]);

  const normalizeRow = (row) => {
    return {
      ...row,
      req_id: row?.req_id ?? row?.REQ_ID ?? row?.request_id ?? row?.REQUEST_ID,
      pr_no: row?.pr_no ?? row?.PR_NO ?? "",
      project_code: row?.project_code ?? row?.PROJECT_CODE ?? "-",
      title: row?.title ?? row?.document_title ?? row?.DOCUMENT_TITLE ?? "-",
      amount: row?.amount ?? row?.total_amount ?? row?.TOTAL_AMOUNT ?? 0,
      status: row?.status ?? row?.STATUS ?? row?.request_status ?? row?.REQUEST_STATUS ?? ""
    };
  };

  const buildRowKey = (row) => {
    const reqId = row?.req_id ?? row?.REQ_ID ?? row?.request_id ?? row?.REQUEST_ID;
    if (reqId !== undefined && reqId !== null && String(reqId).trim() !== "") {
      return `req-${String(reqId).trim()}`;
    }

    const prNo = row?.pr_no ?? row?.PR_NO;
    if (prNo !== undefined && prNo !== null && String(prNo).trim() !== "") {
      return `pr-${String(prNo).trim()}`;
    }

    return JSON.stringify(row);
  };

  const fetchRequests = useCallback(async () => {
    if (!requestIdentifiers.length) {
      return [];
    }

    const allRows = [];

    for (const identifier of requestIdentifiers) {
      const queryVariants = [
        `/initiator/requests?empcode=${encodeURIComponent(identifier)}`,
        `/initiator/requests?initiator_code=${encodeURIComponent(identifier)}`
      ];

      try {
        for (const queryUrl of queryVariants) {
          const res = await API.get(queryUrl);
          const rows = Array.isArray(res.data) ? res.data : [];
          allRows.push(...rows);
        }
      } catch (error) {
        console.log(`My Requests fetch failed for identifier ${identifier}:`, error);
      }
    }

    const dedupMap = new Map();

    allRows.forEach((rawRow, index) => {
      const row = normalizeRow(rawRow);
      const key = row?.req_id ? buildRowKey(row) : `${buildRowKey(row)}-${index}`;
      if (!dedupMap.has(key)) {
        dedupMap.set(key, row);
      }
    });

    const rows = [...dedupMap.values()];

    rows.sort((firstRow, secondRow) => {
      const firstReq = Number(firstRow?.req_id ?? 0);
      const secondReq = Number(secondRow?.req_id ?? 0);

      if (!Number.isNaN(firstReq) && !Number.isNaN(secondReq) && firstReq !== secondReq) {
        return secondReq - firstReq;
      }

      const firstDate = new Date(firstRow?.created_date ?? firstRow?.CREATED_DATE ?? firstRow?.date ?? firstRow?.DATE ?? 0).getTime();
      const secondDate = new Date(secondRow?.created_date ?? secondRow?.CREATED_DATE ?? secondRow?.date ?? secondRow?.DATE ?? 0).getTime();

      return (secondDate || 0) - (firstDate || 0);
    });

    return rows;
  }, [requestIdentifiers]);

  const refreshData = useCallback(async () => {
    setLoading(true);

    try {
      const rows = await fetchRequests();
      setData(rows);
    } catch (error) {
      console.log("My Requests API Error:", error);
      setData([]);
      message.error("My Requests load nahi ho paaya");
    } finally {
      setLoading(false);
    }
  }, [fetchRequests]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!requestIdentifiers.length) {
        if (isMounted) {
          setData([]);
        }
        return;
      }

      if (isMounted) {
        setLoading(true);
      }

      try {
        const rows = await fetchRequests();
        if (isMounted) {
          setData(rows);
        }
      } catch (error) {
        console.log("My Requests API Error:", error);
        if (isMounted) {
          setData([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [requestIdentifiers, fetchRequests]);

  const getValueByKeys = (record, keys) => {
    for (const key of keys) {
      const value = record?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
    return "";
  };

  const normalizeCode = (value) => String(value ?? "").trim().toUpperCase();

  const isPendingCode = (value) => {
    const code = normalizeCode(value);
    return code === "P" || code === "PENDING";
  };

  const getRequestStatusCode = (record) => {
    return normalizeCode(getValueByKeys(record, ["status", "STATUS", "request_status", "REQUEST_STATUS", "status_code", "STATUS_CODE"]));
  };

  const stageMap = [
    {
      label: "Manager",
      color: "orange",
      keys: ["manager", "MANAGER", "manager_apr", "MANAGER_APR"]
    },
    {
      label: "SR Manager",
      color: "blue",
      keys: ["sr_manager", "SR_MANAGER", "sr_manager_apr", "SR_MANAGER_APR"]
    },
    {
      label: "PMC",
      color: "purple",
      keys: ["pmc", "PMC", "pmc_apr", "PMC_APR"]
    },
    {
      label: "PI",
      color: "gold",
      keys: ["pi", "PI", "pi_apr", "PI_APR"],
      nameKeys: ["pi_name", "PI_NAME", "pi_code", "PI_CODE"]
    },
    {
      label: "AC",
      color: "cyan",
      keys: ["ac", "AC", "ac_apr", "AC_APR"],
      nameKeys: ["ac_name", "AC_NAME", "ac_code", "AC_CODE"]
    },
    {
      label: "AD",
      color: "geekblue",
      keys: ["ad", "AD", "ad_apr", "AD_APR"],
      nameKeys: ["ad_name", "AD_NAME", "ad_code", "AD_CODE"]
    },
    {
      label: "Director",
      color: "magenta",
      keys: ["dir", "DIR", "dir_apr", "DIR_APR"],
      nameKeys: ["dir_name", "DIR_NAME", "dir_code", "DIR_CODE"]
    },
    {
      label: "PD",
      color: "volcano",
      keys: ["pd", "PD", "pd_apr", "PD_APR"],
      nameKeys: ["pd_name", "PD_NAME", "pd_code", "PD_CODE"]
    },
    {
      label: "Purchase Head",
      color: "purple",
      keys: ["purchase_head", "PURCHASE_HEAD", "purchase_head_apr", "PURCHASE_HEAD_APR"]
    },
    {
      label: "Material Head",
      color: "blue",
      keys: ["material_head", "MATERIAL_HEAD", "material_head_apr", "MATERIAL_HEAD_APR"]
    },
    {
      label: "DG",
      color: "red",
      keys: ["final_dg", "FINAL_DG", "final_dg_apr", "FINAL_DG_APR", "dg", "DG", "dg_apr", "DG_APR"]
    }
  ];

  const getFinalStatus = (record) => {
    const requestStatus = getRequestStatusCode(record);

    const findPendingStage = () => {
      for (const stage of stageMap) {
        const stageCode = normalizeCode(getValueByKeys(record, stage.keys));
        if (stageCode === "P" || stageCode === "PENDING") {
          return stage;
        }
      }

      if (requestStatus === "P" || requestStatus === "PENDING") {
        for (const stage of stageMap) {
          const stageCode = normalizeCode(getValueByKeys(record, stage.keys));
          if (!stageCode || stageCode === "N" || stageCode === "NOT_STARTED") {
            return stage;
          }
        }
      }

      return null;
    };

    if (requestStatus === "SENT_BACK" || requestStatus === "S") {
      return <Tag color="orange">Sent Back</Tag>;
    }

    if (requestStatus === "REJECTED" || requestStatus === "R") {
      return <Tag color="red">Rejected</Tag>;
    }

    const pendingStage = findPendingStage();
    if (pendingStage) {
      const stagePerson = pendingStage.nameKeys ? String(getValueByKeys(record, pendingStage.nameKeys) || "").trim() : "";
      return (
        <Tag color={pendingStage.color}>
          {stagePerson ? `Pending at ${pendingStage.label} (${stagePerson})` : `Pending at ${pendingStage.label}`}
        </Tag>
      );
    }

    if (requestStatus === "SUBMITTED") {
      return <Tag color="blue">Submitted</Tag>;
    }

    if (requestStatus === "PENDING" || requestStatus === "P") {
      return <Tag color="blue">Pending</Tag>;
    }

    if (requestStatus === "N" || requestStatus === "NOT_STARTED") {
      return <Tag color="default">Not Started</Tag>;
    }

    if (requestStatus === "APPROVED" || requestStatus === "A") {
      return <Tag color="green">Approved</Tag>;
    }

    return <Tag color="default">In Process</Tag>;
  };

  const totalAmount = useMemo(() => {
    return data.reduce((accumulator, item) => accumulator + (Number(item?.amount) || 0), 0);
  }, [data]);

  const approvedCount = data.filter((item) => {
    const requestStatus = getRequestStatusCode(item);

    if (
      requestStatus === "SENT_BACK" ||
      requestStatus === "S" ||
      requestStatus === "REJECTED" ||
      requestStatus === "R"
    ) {
      return false;
    }

    const hasPendingStage = stageMap.some((stage) => isPendingCode(getValueByKeys(item, stage.keys)));
    if (hasPendingStage) {
      return false;
    }

    if (
      requestStatus === "SUBMITTED" ||
      requestStatus === "PENDING" ||
      requestStatus === "P" ||
      requestStatus === "N" ||
      requestStatus === "NOT_STARTED" ||
      requestStatus === ""
    ) {
      return false;
    }

    return true;
  }).length;

  const columns = [
    {
      title: "Project Code",
      dataIndex: "project_code",
      key: "project_code",
      render: (text) => <b>{text}</b>
    },
    {
      title: "Title",
      dataIndex: "title",
      key: "title"
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amt) => `₹ ${Number(amt || 0).toLocaleString("en-IN")}`
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) => getFinalStatus(record)
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Button
          type="primary"
          icon={<EyeOutlined />}
          className="bg-gradient-to-r from-blue-500 to-blue-600"
          onClick={() => navigate(`/request/${record.req_id}`)}
        >
          View
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: 20 }}>
      <div
        className="header-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14
        }}
      >
        <Space>
          <FileDoneOutlined />
          <span>My Requests</span>
        </Space>

        <Button icon={<ReloadOutlined />} onClick={refreshData} loading={loading}>
          Refresh
        </Button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Total Requests</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b" }}>{data.length}</div>
        </Card>

        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Approved</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>{approvedCount}</div>
        </Card>

        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Total Amount</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0f766e" }}>
            ₹ {totalAmount.toLocaleString("en-IN")}
          </div>
        </Card>
      </div>

      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
        }}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="req_id"
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: "No requests found" }}
        />
      </Card>
    </div>
  );
}

export default InitiatorDashboard;
