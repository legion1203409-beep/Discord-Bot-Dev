import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type PublicToolbarActionSetter = Dispatch<SetStateAction<ReactNode | null>>;

type PublicToolbarActionContextValue = {
  action: ReactNode | null;
  setAction: PublicToolbarActionSetter;
};

export const PublicToolbarActionContext = createContext<PublicToolbarActionContextValue | null>(null);

export function usePublicToolbarAction(action: ReactNode | null) {
  const setToolbarAction = useContext(PublicToolbarActionContext)?.setAction;

  useEffect(() => {
    if (!setToolbarAction) return;
    setToolbarAction(action);
    return () => setToolbarAction(null);
  }, [action, setToolbarAction]);
}