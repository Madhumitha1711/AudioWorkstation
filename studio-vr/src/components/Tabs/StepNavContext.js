import { createContext, useContext } from "react";

export const StepNavContext = createContext(null);

export const useStepNav = () => useContext(StepNavContext);
