import React from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  const [loading, setLoading] = React.useState(false);
  
  const handleExport = () => {
    const orderId = data.selected?.[0]?.id;
    
    if (!orderId) {
      console.error('No order selected');
      return;
    }
    
    setLoading(true);
    const numericId = orderId.split('/').pop();
    const downloadUrl = `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
    
    // 방법 1: 새 창에서 열기 (권장)
    window.open(downloadUrl, '_blank');
    
    // 방법 2: 현재 창에서 다운로드 (백업)
    // window.location.href = downloadUrl;
    
    // 2초 후 모달 닫기
    setTimeout(() => {
      setLoading(false);
      close();
    }, 2000);
  };

  return (
    <AdminAction
      primaryAction={
        <Button 
          onPress={handleExport} 
          variant="primary"
          disabled={loading}
        >
          {loading ? 'Downloading...' : 'Download CSV'}
        </Button>
      }
      secondaryAction={
        <Button onPress={() => close()} variant="plain">
          Cancel
        </Button>
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Export to Zedonk CSV
        </Text>
        <Text variant="bodyMd" as="p">
          주문 데이터를 CSV 파일로 다운로드합니다.
        </Text>
        {loading && (
          <Text variant="bodySm" as="p" tone="subdued">
            새 창에서 다운로드가 시작됩니다...
          </Text>
        )}
      </BlockStack>
    </AdminAction>
  );
}