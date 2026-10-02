import { TopicTabsLab } from "../../shared/ExampleLab/ExampleLab";
import { CONNECTION_TABS, connectionImagePath } from "./analogDigitalConnectionsData";

export default function AnalogDigitalConnectionsLab(props) {
  return <TopicTabsLab {...props} tabs={CONNECTION_TABS} imagePath={connectionImagePath} ariaLabel="Analog and digital connection topics" />;
}
