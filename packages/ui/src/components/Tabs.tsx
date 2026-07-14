import * as React from 'react';

interface TabsContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

const useTabsContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs component');
  }
  return context;
};

interface TabsProps {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

const Tabs: React.FC<TabsProps> = ({ value, onValueChange, className = '', children }) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

interface TabsListProps {
  className?: string;
  children: React.ReactNode;
}

const TabsList: React.FC<TabsListProps> = ({ className = '', children }) => {
  return (
    <div
      className={`inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground ${className}`}
    >
      {children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  className?: string;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

const TabsTrigger: React.FC<TabsTriggerProps> = ({ value, className = '', children, onClick }) => {
  const { value: activeValue, onValueChange } = useTabsContext();
  const isActive = activeValue === value;

  const handleClick = (e: React.MouseEvent) => {
    onValueChange?.(value);
    onClick?.(e);
  };

  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'hover:bg-accent hover:text-accent-foreground'
      } ${className}`}
      onClick={handleClick}
    >
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

const TabsContent: React.FC<TabsContentProps> = ({ value, className = '', children }) => {
  const { value: activeValue } = useTabsContext();

  if (activeValue !== value) {
    return null;
  }

  return (
    <div
      className={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
    >
      {children}
    </div>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps };
