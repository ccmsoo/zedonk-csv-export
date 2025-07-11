import React from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Banner,
  Badge,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-index.selection-action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  const [loading, setLoading] = React.useState(false);
  const [showInstructions, setShowInstructions] = React.useState(false);
  
  // 선택된 주문 수 확인
  const selectedCount = data.selected?.length || 0;
  
  const handleExportBulk = () => {
    if (!data.selected || data.selected.length === 0) {
      return;
    }
    
    setLoading(true);
    
    try {
      // 모든 선택된 주문의 ID 추출
      const orderIds = data.selected.map(order => order.id.split('/').pop());
      const idsParam = orderIds.join(',');
      
      const downloadUrl = `https://zedonk-csv-export.onrender.com/api/orders?ids=${idsParam}`;
      
      // 새 창에서 열기
      window.open(downloadUrl, '_blank');
      
      setLoading(false);
      setShowInstructions(true);
      
      // 3초 후 자동으로 닫기
      setTimeout(() => {
        close();
      }, 3000);
      
    } catch (err) {
      console.error('Export error:', err);
      setLoading(false);
    }
  };

  return (
    <AdminAction
      primaryAction={
        <Button 
          onPress={handleExportBulk} 
          variant="primary"
          disabled={loading || selectedCount === 0}
        >
          {loading ? 'Processing...' : `Export ${selectedCount} Orders`}
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
        
        {selectedCount > 0 && !showInstructions && (
          <BlockStack gap="tight">
            <Badge tone="info">{selectedCount} orders selected</Badge>
            <Text variant="bodyMd" as="p">
              선택한 모든 주문을 하나의 CSV 파일로 내보냅니다.
            </Text>
          </BlockStack>
        )}
        
        {selectedCount === 0 && (
          <Banner tone="warning">
            <Text>주문을 선택해주세요.</Text>
          </Banner>
        )}
        
        {showInstructions && (
          <Banner tone="success">
            <Text>새 창에서 다운로드가 시작됩니다. 팝업이 차단된 경우 허용해주세요.</Text>
          </Banner>
        )}
      </BlockStack>
    </AdminAction>
  );
}