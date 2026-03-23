import React, { useState } from "react";
import { Card, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import API from "../api/api";

export default function LoginPage() {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleLogin = async () => {

    try {

      const res = await API.post("/login", {
        username,
        password
      });

      if (res.data.status === "success") {

        const resolvedUsername = String(res.data.username ?? username ?? "").trim();
        const resolvedEmpcode = String(
          res.data.empcode ??
          res.data.emp_code ??
          res.data.EMPCODE ??
          res.data.EMP_CODE ??
          res.data.employee_code ??
          resolvedUsername
        ).trim();

        // ========== Determine highest role if multiple roles exist ==========
        const eligibleRoles = Array.isArray(res.data.eligible_roles) 
          ? res.data.eligible_roles 
          : [res.data.role];
        
        const ROLE_HIERARCHY = [
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
        
        // Find the highest role in the hierarchy
        let highestRole = res.data.role;
        let highestIndex = -1;
        
        for (const role of eligibleRoles) {
          const roleIndex = ROLE_HIERARCHY.indexOf(role);
          if (roleIndex > highestIndex) {
            highestIndex = roleIndex;
            highestRole = role;
          }
        }

        // ✅ Store login details
        localStorage.setItem("username", resolvedUsername);
        localStorage.setItem("role", highestRole);
        localStorage.setItem("eligible_roles", JSON.stringify(eligibleRoles));
        localStorage.setItem("empcode", resolvedEmpcode);

        message.success("Login Successful");

        if (highestRole === "INITIATOR") {
          navigate("/purchase");
        } else {
          navigate("/approval");
        }

        window.location.reload();

      } else {
        message.error("Invalid Credentials");
      }

    } catch (error) {

      console.log(error);
      message.error("Server Error");

    }

  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-500 via-teal-400 to-green-600">

      <Card
        bordered={false}
        className="w-[380px] rounded-2xl shadow-2xl bg-white/90 backdrop-blur-md"
      >
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-emerald-600">
            DMS Portal
          </h1>
        </div>

        <Input
          size="large"
          placeholder="Username"
          prefix={<UserOutlined />}
          className="mb-4 rounded-lg"
          value={username}
          onChange={(e)=>setUsername(e.target.value)}
        />

        <Input.Password
          size="large"
          placeholder="Password"
          prefix={<LockOutlined />}
          className="mb-6 rounded-lg"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />

        <Button
          type="primary"
          size="large"
          block
          onClick={handleLogin}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 border-0"
        >
          Login
        </Button>

        <div className="text-center text-xs text-gray-400 mt-6">
          © 2026 DMS Purchase Portal
        </div>
      </Card>

    </div>
  );
}