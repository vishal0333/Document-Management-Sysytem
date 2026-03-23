import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Card, Button, Tag, Space, Typography, message } from "antd";
import { InboxOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import API from "../api/api";

export default function SentBackPage() {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const empcode = localStorage.getItem("empcode");

    const fetchData = useCallback(async () => {
        if (!empcode) {
            setData([]);
            return;
        }

        setLoading(true);

        try {
            const res = await API.get(`/initiator/sent-back?empcode=${empcode}`);
            setData(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.log("Sent Back API Error:", err);
            message.error("Sent Back data load nahi ho paaya");
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [empcode]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalAmount = useMemo(() => {
        return data.reduce((total, item) => total + (Number(item?.amount) || 0), 0);
    }, [data]);

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
            render: (value) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`
        },
        {
            title: "Sent Back Remark",
            dataIndex: "remark",
            render: (value) => <Typography.Text>{value || "-"}</Typography.Text>
        },
        {
            title: "Date",
            dataIndex: "date",
            render: (value) => {
                if (!value) {
                    return "-";
                }

                const parsedDate = new Date(value);
                if (Number.isNaN(parsedDate.getTime())) {
                    return String(value);
                }

                return parsedDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                });
            }
        },
        {
            title: "Action",
            render: (_, record) => (
                <Button
                    type="primary"
                    icon={<EditOutlined />}
                    className="bg-blue-500"
                    onClick={() => navigate(`/edit-request/${record.req_id}`)}
                >
                    Edit & Resubmit
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
                    <InboxOutlined />
                    <span>Sent Back Requisitions</span>
                </Space>

                <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
                    Refresh
                </Button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <Card size="small" style={{ minWidth: 220 }}>
                    <Typography.Text type="secondary">Total Sent Back</Typography.Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b" }}>{data.length}</div>
                </Card>

                <Card size="small" style={{ minWidth: 220 }}>
                    <Typography.Text type="secondary">Total Amount</Typography.Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#0f766e" }}>
                        ₹ {totalAmount.toLocaleString("en-IN")}
                    </div>
                </Card>
            </div>

            <Card style={{ borderRadius: 12 }} bodyStyle={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={data}
                    rowKey="req_id"
                    loading={loading}
                    pagination={{ pageSize: 8, showSizeChanger: false }}
                    locale={{ emptyText: "No sent back requisitions 🎉" }}
                />
            </Card>
        </div>
    );
}