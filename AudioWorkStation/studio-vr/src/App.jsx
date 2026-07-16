import { useDispatch, useSelector } from "react-redux";
import Header from "./components/Header";
import LandingPage from "./pages/LandingPage";
import PaymentPage from "./pages/PaymentPage";
import CoursePage from "./pages/CoursePage";
import LoginPage from "./pages/LoginPage";
import PanoramaTour from "./panorama/PanoramaTour";
import { setScreen } from "./store/uiSlice";
import { setStudentName } from "./store/sessionSlice";

function App() {
  const dispatch = useDispatch();
  const screen = useSelector((state) => state.ui.screen);
  const studentName = useSelector((state) => state.session.studentName);

  const handleLogin = (name) => {
    dispatch(setStudentName(name));
    dispatch(setScreen("studio"));
  };

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
        screen={screen}
        studentName={studentName}
        onNavigateHome={() => dispatch(setScreen("landing"))}
      />

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {screen === "landing" && <LandingPage />}
        {screen === "payment" && <PaymentPage />}
        {screen === "course" && <CoursePage />}
        {screen === "login" && (
          <LoginPage
            onLogin={handleLogin}
            onBack={() => dispatch(setScreen("landing"))}
          />
        )}
        {screen === "studio" && <PanoramaTour />}
      </div>
    </div>
  );
}

export default App;
