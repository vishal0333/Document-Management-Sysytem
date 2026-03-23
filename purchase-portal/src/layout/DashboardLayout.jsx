import React, { useCallback, useEffect, useState } from "react";
import { Badge, Layout, Menu } from "antd";
import {
  FileAddOutlined,
  FileTextOutlined,
  RollbackOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import API from "../api/api";

const { Sider, Content } = Layout;

export default function DashboardLayout({ children }) {

  const navigate = useNavigate();
  const role = localStorage.getItem("role");  // ✅ add this
  const empcode = localStorage.getItem("empcode");

  const [queryCount, setQueryCount] = useState(0);
  const [sentBackCount, setSentBackCount] = useState(0);

  const fetchNotificationCounts = useCallback(async () => {
    if (role !== "INITIATOR" || !empcode) {
      return { queryCount: 0, sentBackCount: 0 };
    }

    try {
      const [queriesRes, sentBackRes] = await Promise.all([
        API.get(`/initiator/queries?empcode=${empcode}`),
        API.get(`/initiator/sent-back?empcode=${empcode}`)
      ]);

      const queries = Array.isArray(queriesRes.data) ? queriesRes.data : [];
      const sentBackCases = Array.isArray(sentBackRes.data) ? sentBackRes.data : [];

      return {
        queryCount: queries.length,
        sentBackCount: sentBackCases.length
      };
    } catch {
      return { queryCount: 0, sentBackCount: 0 };
    }
  }, [empcode, role]);

  useEffect(() => {
    let isMounted = true;

    const refreshCounts = async () => {
      const counts = await fetchNotificationCounts();

      if (!isMounted || !counts) {
        return;
      }

      setQueryCount(counts.queryCount);
      setSentBackCount(counts.sentBackCount);
    };

    refreshCounts();

    const intervalId = setInterval(() => {
      refreshCounts();
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [fetchNotificationCounts]);

  return (

    <Layout style={{ minHeight: "100vh" }}>

      {/* ✅ Sidebar only for INITIATOR */}
      {role === "INITIATOR" && (
        <Sider width={220} style={{ background: "#0f172a" }}>

          <div style={{
            color:"#fff",
            fontWeight:"bold",
            padding:20,
            fontSize:18
          }}>
            DMS Portal
          </div>

          <Menu theme="dark" mode="inline">

            <Menu.Item
              icon={<FileAddOutlined />}
              onClick={()=>navigate("/purchase")}
            >
              Create Request
            </Menu.Item>

            <Menu.Item
              icon={<FileTextOutlined />}
              onClick={()=>navigate("/my-requests")}
            >
              My Requests
            </Menu.Item>

            <Menu.Item
              icon={<RollbackOutlined />}
              onClick={()=>navigate("/sent-back")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <span>Sent Back</span>
                {sentBackCount > 0 && (
                  <Badge count={sentBackCount} size="small" overflowCount={99} />
                )}
              </div>
            </Menu.Item>

            
            <Menu.Item
              icon={<FileTextOutlined />}
              onClick={()=>navigate("/initiator-queries")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <span>My Queries</span>
                {queryCount > 0 && (
                  <Badge count={queryCount} size="small" overflowCount={99} />
                )}
              </div>
            </Menu.Item>

          </Menu>

        </Sider>
      )}

      {/* MAIN */}
      <Layout>
        <Content style={{
          padding:"10px 30px 30px",
          background:"#f1f5f9"
        }}>
          {children}
        </Content>

      </Layout>

    </Layout>

  );
}