import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Header from "./components/Header";
import LandingPage from "./pages/LandingPage";
import PaymentPage from "./pages/PaymentPage";
import CoursePage from "./pages/CoursePage";
import LoginPage from "./pages/LoginPage";
import PanoramaTour from "./panorama/PanoramaTour";
import PanoramaImageTester from "./panorama/PanoramaImageTester";
import GaussianSplatTester from "./panorama/GaussianSplatTester";
import ObjectModelTester from "./panorama/ObjectModelTester";

function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const studentName = useSelector((state) => state.session.studentName);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header
        pathname={pathname}
        studentName={studentName}
        onNavigateHome={() => navigate("/")}
      />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/course" element={<CoursePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/studio" element={<PanoramaTour />} />
          <Route path="/panorama-test" element={<PanoramaImageTester />} />
          <Route path="/splat-test" element={<GaussianSplatTester />} />
          <Route path="/model-test" element={<ObjectModelTester />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
