import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import ApprovalPage from "./pages/ApprovalPage";
import LoginPage from "./pages/LoginPage";
import PurchaseCreate from "./pages/PurchaseCreate";
import InitiatorDashboard from "./pages/InitiatorDashboard";
import InitiatorQueries from "./pages/InitiatorQueries";
import RequestDetails from "./pages/RequestDetails";
import SentBackPage from "./pages/SentBackPage";
import Header from "./components/Header";
import DashboardLayout from "./layout/DashboardLayout";

function App() {

const [role, setRole] = useState(localStorage.getItem("role"));
const userRole = role;

useEffect(() => {

const handleStorage = () => {
setRole(localStorage.getItem("role"));
};

window.addEventListener("storage", handleStorage);
return () => window.removeEventListener("storage", handleStorage);

},[]);

return (

<Router>

{role && <Header setRole={setRole}/>}

<Routes>

<Route
path="/"
element={
!role
? <Navigate to="/login"/>
: userRole === "INITIATOR"
? <Navigate to="/purchase"/>
: <Navigate to="/approval"/>
}
/>

<Route path="/login" element={<LoginPage/>}/>

{/* CREATE REQUEST */}

<Route
path="/purchase"
element={
userRole === "INITIATOR"
? (
<DashboardLayout>
<PurchaseCreate/>
</DashboardLayout>
)
: <Navigate to="/login"/>
}
/>

{/* MY REQUESTS */}

<Route
path="/my-requests"
element={
userRole === "INITIATOR"
? (
<DashboardLayout>
<InitiatorDashboard/>
</DashboardLayout>
)
: <Navigate to="/login"/>
}
/>

<Route
path="/initiator-queries"
element={
userRole === "INITIATOR"
? (
<DashboardLayout>
<InitiatorQueries/>
</DashboardLayout>
)
: <Navigate to="/login"/>
}
/>

{/* EDIT REQUEST */}

<Route
path="/edit-request/:req_id"
element={
<DashboardLayout>
<PurchaseCreate/>
</DashboardLayout>
}
/>

{/* REQUEST DETAILS */}

<Route
path="/request/:reqid"
element={
role
? (
<DashboardLayout>
<RequestDetails/>
</DashboardLayout>
)
: <Navigate to="/login"/>
}
/>

{/* SENT BACK */}

<Route
path="/sent-back"
element={
<DashboardLayout>
<SentBackPage/>
</DashboardLayout>
}
/>

{/* APPROVAL */}

<Route
path="/approval"
element={
userRole !== "INITIATOR" && role
? (
<DashboardLayout>
<ApprovalPage/>
</DashboardLayout>
)
: <Navigate to="/login"/>
}
/>

</Routes>

</Router>

);

}

export default App;