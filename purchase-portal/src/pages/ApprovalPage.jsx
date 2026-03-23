import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  message,
  Card,
  Row,
  Col,
  Space,
  Typography,
  Tag,
  Timeline,
  Spin,
  Divider,
  Empty
} from "antd";
import {
  CheckCircleOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  EyeOutlined,
  FileSearchOutlined,
  DownloadOutlined,
  MessageOutlined
} from "@ant-design/icons";
import API from "../api/api";

const PERSON_BY_ROLE = {
  MANAGER: { name: "Ravi Kumar Kahlon", title: "Manager" },
  SR_MANAGER: { name: "Dickens Kumar", title: "Senior Manager" },
  PMC: { name: "Jayakumar V K", title: "Chief Manager-PMU" },
  INITIATOR: { name: "Dhruv Saini", title: "Initiator" }
};

const ROUTE_ORDER = [
  "MANAGER",
  "SR_MANAGER",
  "PMC",
  "PI",
  "AC",
  "AD",
  "DIR",
  "PD",
  "PURCHASE_HEAD",
  "MATERIAL_HEAD",
  "FINAL_DG"
];

const ROUTE_FALLBACK_NAME = {
  MANAGER: "Manager",
  SR_MANAGER: "Senior Manager",
  PMC: "Chief Manager-PMU",
  PI: "Principal Investigator",
  AC: "Area Chair",
  AD: "Associate Director",
  DIR: "Director",
  PD: "Project Director",
  PURCHASE_HEAD: "Purchase Head",
  MATERIAL_HEAD: "Material Head",
  FINAL_DG: "Final DG"
};

export default function ApprovalPage() {

  const empcode = localStorage.getItem("empcode") || "";
  const role = localStorage.getItem("role") || "";

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const [details, setDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailModal, setDetailModal] = useState(false);

  const [remark, setRemark] = useState("");

  const [queryOpen, setQueryOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [queries, setQueries] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [showQueries, setShowQueries] = useState(false);
  const [showApprovalRoute, setShowApprovalRoute] = useState(true);

  const [approvalRoute, setApprovalRoute] = useState({});

  const normalizeEmpCode = (value) => String(value ?? "").trim().padStart(4, "0");

  const formatDateTime = (value) => {
    if (!value) {
      return "-";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatAmount = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`;

  const getTimelineDot = (statusCode) => {
    if (statusCode === "A") {
      return <CheckCircleFilled style={{ color: "#16a34a", fontSize: 16 }} />;
    }

    if (statusCode === "P") {
      return <ClockCircleOutlined style={{ color: "#2563eb", fontSize: 16 }} />;
    }

    if (statusCode === "S") {
      return <CloseCircleOutlined style={{ color: "#f59e0b", fontSize: 16 }} />;
    }

    if (statusCode === "R") {
      return <CloseCircleOutlined style={{ color: "#dc2626", fontSize: 16 }} />;
    }

    return <MinusCircleOutlined style={{ color: "#94a3b8", fontSize: 16 }} />;
  };

  const getPersonLabel = (name, currentRole, empCode) => {
    const roleKey = String(currentRole || "").trim().toUpperCase();
    const mappedPerson = PERSON_BY_ROLE[roleKey];

    const safeName = String(mappedPerson?.name || name || "").trim();
    const safeRole = String(
      mappedPerson?.title || String(currentRole || "").trim().replace(/_/g, " ")
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

  const fetchPending = useCallback(async () => {
    const res = await API.get(`/approval/pending?role=${role}&empcode=${empcode}`);
    return Array.isArray(res.data) ? res.data : [];
  }, [role, empcode]);

  const fetchDetails = useCallback(async (req_id) => {
    const res = await API.get(`/approval/details?req_id=${req_id}`);
    return res.data;
  }, []);

  const fetchQueries = useCallback(async (req_id) => {
    const res = await API.get(`/approval/query-thread?req_id=${req_id}`);
    return Array.isArray(res.data) ? res.data : [];
  }, []);

  const fetchApprovalRoute = useCallback(async (req_id) => {
    const res = await API.get(`/approval/remarks?req_id=${req_id}`);
    return res.data && typeof res.data === "object" ? res.data : {};
  }, []);

  const loadData = useCallback(async () => {
    if (!empcode) {
      setData([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await fetchPending();
      setData(rows);
    } catch (error) {
      console.log("Pending approval load error:", error);
      setData([]);
      message.error("Approval list Not Load");
    } finally {
      setLoading(false);
    }
  }, [empcode, fetchPending]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getQueryTime = (queryItem) => {
    const rawDate = queryItem?.date;
    if (!rawDate) {
      return 0;
    }

    const timestamp = new Date(rawDate).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const orderedQueries = useMemo(() => {
    return [...queries].sort((firstItem, secondItem) => {
      return getQueryTime(secondItem) - getQueryTime(firstItem);
    });
  }, [queries]);

  const routeRows = useMemo(() => {
    const normalizeStatus = (value) => String(value ?? "").trim().toUpperCase();

    const normalizeDisplayText = (value) => {
      const text = String(value ?? "").trim();
      if (!text) {
        return "";
      }

      const upperText = text.toUpperCase();
      if (["-", "NULL", "NONE", "N/A", "NA"].includes(upperText)) {
        return "";
      }

      const codeToken = text.split("-")[0]?.trim() || "";
      if (codeToken && /^0+$/.test(codeToken)) {
        return "";
      }

      if (/^0+\s*-/.test(text)) {
        return "";
      }

      return text;
    };

    const getStatusMeta = (statusCode) => {
      if (statusCode === "A") {
        return { label: "Approved", tagColor: "green", timelineColor: "green" };
      }

      if (statusCode === "P") {
        return { label: "Pending", tagColor: "blue", timelineColor: "blue" };
      }

      if (statusCode === "S") {
        return { label: "Sent Back", tagColor: "orange", timelineColor: "orange" };
      }

      if (statusCode === "R") {
        return { label: "Rejected", tagColor: "red", timelineColor: "red" };
      }

      return { label: "Not Started", tagColor: "default", timelineColor: "gray" };
    };

    return ROUTE_ORDER.map((stageKey) => {
      const routeNode = approvalRoute?.[stageKey] || {};
      const normalizedStatus = normalizeStatus(routeNode.status);
      const statusCode = ["A", "P", "S", "R"].includes(normalizedStatus) ? normalizedStatus : "";
      const statusMeta = getStatusMeta(statusCode);

      const safeName = normalizeDisplayText(routeNode.name);
      const safeRemark = normalizeDisplayText(routeNode.remark);
      const stageName = safeName || ROUTE_FALLBACK_NAME[stageKey] || stageKey;
      const hasDate = Boolean(routeNode.date);

      return {
        stageKey,
        name: stageName || ROUTE_FALLBACK_NAME[stageKey] || stageKey,
        statusCode,
        statusLabel: statusMeta.label,
        tagColor: statusMeta.tagColor,
        timelineColor: statusMeta.timelineColor,
        remark: safeRemark,
        date: routeNode.date,
        hasDate,
        shouldHide: !statusCode && !safeRemark && !hasDate && !safeName
      };
    });
  }, [approvalRoute]);

  const visibleRouteRows = useMemo(() => {
    return routeRows.filter((item) => !item.shouldHide);
  }, [routeRows]);

  const approvedRows = useMemo(() => {
    return visibleRouteRows.filter((item) => item.statusCode === "A");
  }, [visibleRouteRows]);

  const lastApproved = useMemo(() => {
    if (!approvedRows.length) {
      return null;
    }

    const rowsWithIndex = approvedRows.map((item) => ({
      item,
      orderIndex: ROUTE_ORDER.indexOf(item.stageKey)
    }));

    rowsWithIndex.sort((firstRow, secondRow) => firstRow.orderIndex - secondRow.orderIndex);
    return rowsWithIndex[rowsWithIndex.length - 1].item;
  }, [approvedRows]);

  const pendingRow = useMemo(() => {
    return visibleRouteRows.find((item) => item.statusCode === "P") || null;
  }, [visibleRouteRows]);

  const allRouteRows = visibleRouteRows;

  const totalAmount = useMemo(() => {
    return data.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
  }, [data]);

  const openDetails = useCallback(async (record) => {
    setDetailModal(true);
    setDetailLoading(true);
    setDetails(null);
    setQueries([]);
    setApprovalRoute({});
    setRemark("");
    setShowQueries(false);
    setShowApprovalRoute(false);

    const [detailsResult, queriesResult, routeResult] = await Promise.allSettled([
      fetchDetails(record.req_id),
      fetchQueries(record.req_id),
      fetchApprovalRoute(record.req_id)
    ]);

    if (detailsResult.status === "fulfilled") {
      setDetails(detailsResult.value);
    } else {
      message.error("Purchase details Not Load");
      console.log("Details load error:", detailsResult.reason);
    }

    if (queriesResult.status === "fulfilled") {
      setQueries(queriesResult.value);
    } else {
      setQueries([]);
      console.log("Query thread load error:", queriesResult.reason);
    }

    if (routeResult.status === "fulfilled") {
      setApprovalRoute(routeResult.value);
    } else {
      setApprovalRoute({});
      console.log("Approval route load error:", routeResult.reason);
    }

    setDetailLoading(false);
  }, [fetchApprovalRoute, fetchDetails, fetchQueries]);

  const closeDetails = () => {
    setDetailModal(false);
    setRemark("");
    setShowQueries(false);
    setShowApprovalRoute(true);
  };

  const handleSubmitQuery = async () => {
    if (!details?.header?.req_id) {
      message.error("Request details unavailable");
      return;
    }

    if (!queryText.trim()) {
      message.warning("Please enter query");
      return;
    }

    try {
      await API.post("/approval/query", {
        req_id: details.header.req_id,
        role,
        emp_code: empcode,
        query: queryText.trim(),
        parent_id: replyTo
      });

      message.success(replyTo ? "Reply Sent" : "Query Raised");

      setQueryText("");
      setReplyTo(null);
      setQueryOpen(false);

      const refreshedQueries = await fetchQueries(details.header.req_id);
      setQueries(refreshedQueries);
    } catch (error) {
      console.log("Query submit error:", error);
      message.error("Query submit Not Load");
    }
  };

  const takeAction = async (actionType) => {
    if (!details?.header?.req_id) {
      message.error("Request details unavailable");
      return;
    }

    try {
      const trimmedRemark = (remark || "").trim();

      if (actionType === "A" && !trimmedRemark) {
        message.warning("Please enter remark before Approve");
        return;
      }

      if (actionType === "S" && !trimmedRemark) {
        message.warning("Please enter reason for Sent Back");
        return;
      }

      let apiUrl = "/approval/action";
      let payload = {
        req_id: details.header.req_id,
        pr_no: details.header.pr_no,
        empcode,
        action: actionType,
        remark: trimmedRemark
      };

      if (actionType === "R") {
        apiUrl = "/approval/reject";
      }

      if (actionType === "S") {
        apiUrl = "/approval/sent-back";
        payload = {
          req_id: details.header.req_id,
          pr_no: details.header.pr_no,
          empcode,
          remark: trimmedRemark
        };
      }

      const res = await API.post(apiUrl, payload);

      if (res.data.status === "updated") {
        message.success("Action Completed Successfully");
      } else {
        message.error(res.data.message || "Action Failed");
      }

      setDetailModal(false);
      setRemark("");
      loadData();
    } catch (error) {
      console.log("Action error:", error);
      message.error("Server Error");
    }
  };

  const columns = [
    {
      title: "Project Code",
      dataIndex: "project_code",
      render: (value) => <Tag color="blue">{value || "-"}</Tag>
    },
    {
      title: "Title",
      dataIndex: "title",
      render: (value) => <Typography.Text strong>{value || "-"}</Typography.Text>
    },
    {
      title: "Amount",
      dataIndex: "amount",
      render: (value) => formatAmount(value)
    },
    {
      title: "View",
      render: (_, record) => (
        <Button className="approval-btn-indigo" type="primary" icon={<EyeOutlined />} onClick={() => openDetails(record)}>
          View
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: 20 }}>
      <div
        className="header-bar approval-header-bar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14
        }}
      >
        <Space>
          <CheckCircleOutlined />
          <span>Approval Dashboard ({empcode || "-"})</span>
        </Space>

        <Button className="approval-btn-light" icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          Refresh
        </Button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Open Approvals</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b" }}>{data.length}</div>
        </Card>

        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Total Amount</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0f766e" }}>
            ₹ {totalAmount.toLocaleString("en-IN")}
          </div>
        </Card>

        <Card size="small" style={{ minWidth: 220 }}>
          <Typography.Text type="secondary">Your Role</Typography.Text>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1d4ed8" }}>
            {String(role || "-").replace(/_/g, " ")}
          </div>
        </Card>
      </div>

      <Card bordered={false} style={{ borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="req_id"
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: "No pending approvals" }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <FileSearchOutlined />
            <span>Purchase Details & Approval Flow</span>
          </Space>
        }
        open={detailModal}
        onCancel={closeDetails}
        footer={null}
        width={980}
      >
        {detailLoading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
            <Spin size="large" />
          </div>
        )}

        {!detailLoading && details && (
          <>
            <Card size="small" style={{ borderRadius: 10 }}>
              <Row gutter={[12, 8]}>
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary">PR No</Typography.Text>
                  <div><b>{details.header.pr_no || "-"}</b></div>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary">Project Code</Typography.Text>
                  <div><b>{details.header.project_code || "-"}</b></div>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary">Title</Typography.Text>
                  <div>{details.header.title || "-"}</div>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Text type="secondary">Total Amount</Typography.Text>
                  <div><b>{formatAmount(details.header.amount)}</b></div>
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">Description</Typography.Text>
                  <div>{details.header.description || "-"}</div>
                </Col>
                <Col span={24}>
                  <Typography.Text type="secondary">Initiator Remark</Typography.Text>
                  <div>{details.header.initiator_remark || "-"}</div>
                </Col>
              </Row>

              <Divider style={{ margin: "12px 0" }} />

              <Space wrap>
                {details.header.main_doc?.length > 0 ? (
                  details.header.main_doc.map((doc, index) => (
                    <Button
                      className="approval-btn-cyan"
                      key={doc || index}
                      type="primary"
                      icon={<DownloadOutlined />}
                      onClick={() => window.open(`https://teriindia.sharepoint.com${doc}`, "_blank")}
                    >
                      Download {index + 1}
                    </Button>
                  ))
                ) : (
                  <Typography.Text type="secondary">No document attached</Typography.Text>
                )}
              </Space>
            </Card>

            <Card title="Vendor Details" size="small" style={{ marginTop: 14, borderRadius: 10 }}>
              <Table
                dataSource={details.vendors}
                pagination={false}
                rowKey={(record, index) => `${record.vendor_name || "vendor"}-${index}`}
                size="small"
                columns={[
                  { title: "Vendor", dataIndex: "vendor_name", render: (value) => value || "-" },
                  {
                    title: "Amount",
                    dataIndex: "amount",
                    render: (value) => formatAmount(value)
                  },
                  { title: "Ranking", dataIndex: "vendor_ranking", render: (value) => value || "-" },
                  { title: "Remark", dataIndex: "remark", render: (value) => value || "-" },
                  {
                    title: "Quotation",
                    render: (_, record) => (
                      record.quotation ? (
                        <Button
                          className="approval-btn-indigo"
                          size="small"
                          type="primary"
                          onClick={() => window.open(`https://teriindia.sharepoint.com${record.quotation}`, "_blank")}
                        >
                          View
                        </Button>
                      ) : (
                        "-"
                      )
                    )
                  }
                ]}
              />
            </Card>

            <Card title="Approval Route" size="small" style={{ marginTop: 14, borderRadius: 10 }}>
              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col xs={24} md={8}>
                  <Card size="small">
                    <Typography.Text type="secondary">Last Approved By</Typography.Text>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{lastApproved?.name || "-"}</div>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card size="small">
                    <Typography.Text type="secondary">Pending With</Typography.Text>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{pendingRow?.name || "-"}</div>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card size="small">
                    <Typography.Text type="secondary">Total Approved</Typography.Text>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>{approvedRows.length}/{allRouteRows.length}</div>
                  </Card>
                </Col>
              </Row>

              <Button
                className="approval-btn-slate"
                size="small"
                type="primary"
                onClick={() => setShowApprovalRoute((previous) => !previous)}
                style={{ marginBottom: showApprovalRoute ? 10 : 0 }}
              >
                {showApprovalRoute ? "Minimize Approval" : `Open Approval (${allRouteRows.length})`}
              </Button>

              {showApprovalRoute && (approvedRows.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary">Approved By</Typography.Text>
                  <div>{approvedRows.map((item) => item.name).join(", ")}</div>
                </div>
              ) : (
                <Typography.Text type="secondary">Abhi tak kisi ne approve nahi kiya.</Typography.Text>
              ))}

              {showApprovalRoute && (allRouteRows.length > 0 ? (
                <Timeline
                  items={allRouteRows.map((item) => ({
                    color: item.timelineColor,
                    dot: getTimelineDot(item.statusCode),
                    children: (
                      <div>
                        <Space wrap>
                          <Typography.Text strong>
                            {item.statusCode === "A" ? `✓ ${item.name}` : item.name}
                          </Typography.Text>
                          <Tag color={item.tagColor}>{item.statusLabel}</Tag>
                        </Space>
                        <div style={{ color: "#64748b", marginTop: 2 }}>
                          {item.remark ? `Remark: ${item.remark}` : "Remark: -"}
                        </div>
                        <div style={{ color: "#64748b" }}>
                          Date: {formatDateTime(item.date)}
                        </div>
                      </div>
                    )
                  }))}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Approval route unavailable" />
              ))}
            </Card>

            <Card title="Queries" size="small" style={{ marginTop: 14, borderRadius: 10 }}>
              <Button
                className="approval-btn-slate"
                size="small"
                type="primary"
                onClick={() => setShowQueries((previous) => !previous)}
                style={{ marginBottom: showQueries ? 10 : 0 }}
              >
                {showQueries ? "Minimize Queries" : `Open Queries (${queries.length})`}
              </Button>

              {showQueries && queries.length === 0 && <p>No Queries</p>}

              {showQueries && orderedQueries.map((q, index) => {
                const senderRole = String(q.from_role || q.role || "").toUpperCase();
                const isInitiatorMessage = senderRole === "INITIATOR";
                const cardBackground = isInitiatorMessage
                  ? "#ecfeff"
                  : (index % 2 === 0 ? "#f3e8ff" : "#ede9fe");

                return (
                  <div
                    key={q.id || `${q.from_empcode || "na"}-${q.to_empcode || "na"}-${q.date || "na"}-${q.query || "na"}`}
                    style={{
                      marginLeft: q.parent_id ? "30px" : "0px",
                      background: cardBackground,
                      padding: "8px",
                      marginBottom: "5px",
                      borderRadius: "6px"
                    }}
                  >
                    <b>{getPersonLabel(q.from_name || q.name, q.from_role || q.role, q.from_empcode)}</b>
                    {q.to_empcode && (
                      <span style={{ color: "#64748b" }}>
                        {" "}→ {getPersonLabel(q.to_name, q.to_role, q.to_empcode)}
                      </span>
                    )}
                    : {q.text || q.query}
                  </div>
                );
              })}
            </Card>

            <Card title="Action" size="small" style={{ marginTop: 14, borderRadius: 10 }}>
              <Typography.Text type="secondary">Approval/Sent Back Remark</Typography.Text>
              <Input.TextArea
                rows={3}
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                style={{ marginTop: 8 }}
              />

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button className="approval-btn-green" type="primary" onClick={() => takeAction("A")}>
                  Approve
                </Button>

                <Button className="approval-btn-yellow" type="primary" onClick={() => takeAction("S")}>
                  Sent Back
                </Button>

                <Button onClick={closeDetails}>Close</Button>

                <Button
                  className="approval-btn-purple"
                  type="primary"
                  icon={<MessageOutlined />}
                  onClick={() => {
                    setReplyTo(null);
                    setQueryOpen(true);
                  }}
                >
                  Raise Query
                </Button>
              </div>
            </Card>
          </>
        )}
      </Modal>

      <Modal
        title={replyTo ? "Reply to Query" : "Raise Query"}
        open={queryOpen}
        onCancel={() => {
          setQueryOpen(false);
          setReplyTo(null);
        }}
        onOk={handleSubmitQuery}
        okButtonProps={{ className: "approval-btn-purple" }}
        okText="Send"
      >
        <Input.TextArea
          rows={4}
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          placeholder="Enter your message..."
        />
      </Modal>
    </div>
  );
}