import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Button, Modal, Input, message, Card, Space, Typography, Tag } from "antd";
import { MessageOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import API from "../api/api";

export default function InitiatorQueries() {
  const empcode = localStorage.getItem("empcode");

  const [data, setData] = useState([]);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const PERSON_BY_ROLE = {
    MANAGER: { name: "Ravi Kumar Kahlon", title: "Manager" },
    SR_MANAGER: { name: "Dickens Kumar", title: "Senior Manager" },
    PMC: { name: "Jayakumar V K", title: "Chief Manager-PMU" },
    INITIATOR: { name: "Dhruv Saini", title: "Initiator" }
  };

  const normalizeEmpCode = (value) => String(value ?? "").trim().padStart(4, "0");

  const getPersonLabel = (name, role, empCode) => {
    const roleKey = String(role || "").trim().toUpperCase();
    const mappedPerson = PERSON_BY_ROLE[roleKey];

    const safeName = String(mappedPerson?.name || name || "").trim();
    const safeRole = String(
      mappedPerson?.title || String(role || "").trim().replace(/_/g, " ")
    ).trim();
    const safeCode = normalizeEmpCode(empCode);

    if (safeName && safeRole) {
      return `${safeName} (${safeRole})`;
    }

    if (safeName) {
      return safeName;
    }

    if (safeRole && safeCode) {
      return `${safeRole} (${safeCode})`;
    }

    if (safeRole) {
      return safeRole;
    }

    return safeCode || "Unknown";
  };

  const getQueries = useCallback(async () => {
    if (!empcode) {
      return [];
    }

    const res = await API.get(`/initiator/queries?empcode=${empcode}`);

    const rows = Array.isArray(res.data) ? res.data : [];

    return rows
      .filter((item) => item?.req_id)
      .map((item) => ({
        req_id: item.req_id,
        project_code: item.project_code || "-",
        query: item.query || "-",
        date: item.date
      }));
  }, [empcode]);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const queries = await getQueries();
      setData(queries);
    } catch {
      setData([]);
      message.error("Queries load nahi ho paayi");
    } finally {
      setLoading(false);
    }
  }, [getQueries]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (isMounted) {
        setLoading(true);
      }

      try {
        const queries = await getQueries();

        if (isMounted) {
          setData(queries);
        }
      } catch {
        if (isMounted) {
          setData([]);
        }
        message.error("Queries load nahi ho paayi");
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
  }, [getQueries]);

  const openQuery = async (record) => {
    setSelected(record);
    setHistory([]);
    setOpen(true);

    setHistoryLoading(true);
    try {
      const res = await API.get(`/approval/query-thread?req_id=${record.req_id}`);
      const rows = Array.isArray(res.data) ? res.data : [];
      const orderedRows = [...rows].sort((firstItem, secondItem) => {
        return new Date(secondItem?.date || 0).getTime() - new Date(firstItem?.date || 0).getTime();
      });
      setHistory(orderedRows);
    } catch {
      setHistory([]);
      message.error("Query history load nahi ho paayi");
    } finally {
      setHistoryLoading(false);
    }
  };

  const submitReply = async () => {
    if (!selected?.req_id) {
      return;
    }

    if (!reply.trim()) {
      message.warning("Please enter reply");
      return;
    }

    try {
      await API.post("/approval/query-reply", {
        req_id: selected.req_id,
        emp_code: empcode,
        query: reply
      });

      setReply("");
      setOpen(false);
      setHistory([]);
      await loadData();
      message.success("Reply submitted");
    } catch {
      message.error("Reply submit nahi ho paaya");
    }
  };

  const totalQueries = data.length;

  const latestDate = useMemo(() => {
    const firstRow = data[0];
    if (!firstRow?.date) {
      return "-";
    }

    const parsedDate = new Date(firstRow.date);
    if (Number.isNaN(parsedDate.getTime())) {
      return String(firstRow.date);
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }, [data]);

  const columns = [
    {
      title: "REQ ID",
      dataIndex: "req_id",
      render: (value) => <Tag color="blue">{value}</Tag>
    },
    {
      title: "Project Code",
      dataIndex: "project_code",
      render: (value) => <Typography.Text strong>{value || "-"}</Typography.Text>
    },
    {
      title: "Latest Query",
      dataIndex: "query",
      ellipsis: true,
      render: (value) => value || "-"
    },
    {
      title: "Action",
      render: (_, record) => (
        <Button
          type="primary"
          icon={<SendOutlined />}
          className="bg-blue-500"
          onClick={() => openQuery(record)}
        >
          Reply
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
          <MessageOutlined />
          <span>My Queries</span>
        </Space>

        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          Refresh
        </Button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Pending Queries</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b" }}>{totalQueries}</div>
        </Card>

        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Latest Query Date</Typography.Text>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0f766e" }}>{latestDate}</div>
        </Card>
      </div>

      <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="req_id"
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: "No pending queries 🎉" }}
        />
      </Card>

      <Modal
        open={open}
        width={760}
        onCancel={() => {
          setOpen(false);
          setReply("");
          setHistory([]);
        }}
        onOk={submitReply}
        okText="Submit Reply"
        title="Reply to Query"
      >
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
          <Typography.Text><b>REQ ID:</b> {selected?.req_id || "-"}</Typography.Text>
          <Typography.Text><b>Project Code:</b> {selected?.project_code || "-"}</Typography.Text>
        </div>
        <Typography.Paragraph style={{ marginBottom: 12 }}>
          <b>Latest Query:</b> {selected?.query || "-"}
        </Typography.Paragraph>

        <div style={{ marginBottom: 12 }}>
          <b>Query History</b>
          <div
            style={{
              border: "1px solid #f0f0f0",
              borderRadius: 10,
              padding: 10,
              marginTop: 8,
              maxHeight: 240,
              overflowY: "auto",
              background: "#f8fafc"
            }}
          >
            {historyLoading && <p>Loading history...</p>}

            {!historyLoading && history.length === 0 && <p>No query history found</p>}

            {!historyLoading && history.map((item, index) => {
              const isInitiatorMessage = String(item?.from_role || "").toUpperCase() === "INITIATOR";

              return (
                <div
                  key={`${item?.date || "na"}-${item?.from_empcode || "na"}-${index}`}
                  style={{
                    background: isInitiatorMessage ? "#ecfeff" : "#f3e8ff",
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8
                  }}
                >
                  <div>
                    <b>
                      {getPersonLabel(item?.from_name, item?.from_role, item?.from_empcode)}
                    </b>
                    {item?.to_empcode && (
                      <span style={{ color: "#64748b" }}>
                        {" "}→ {getPersonLabel(item?.to_name, item?.to_role, item?.to_empcode)}
                      </span>
                    )}
                  </div>

                  <div>{item?.query || "-"}</div>
                </div>
              );
            })}
          </div>
        </div>

        <Input.TextArea
          rows={4}
          value={reply}
          placeholder="Type your reply..."
          onChange={(e)=>setReply(e.target.value)}
        />
      </Modal>
    </div>
  );
}