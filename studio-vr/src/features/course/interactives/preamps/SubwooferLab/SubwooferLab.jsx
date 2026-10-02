import { TopicTabsLab } from "../../shared/ExampleLab/ExampleLab";
import { SUBWOOFER_TABS, subwooferImagePath } from "./subwooferData";

export default function SubwooferLab(props) {
  return <TopicTabsLab {...props} tabs={SUBWOOFER_TABS} imagePath={subwooferImagePath} ariaLabel="Subwoofer topics" />;
}
