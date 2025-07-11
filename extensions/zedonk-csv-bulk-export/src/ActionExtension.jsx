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
  const [downloadUrl, setDownloadUrl] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  
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
      
      const url = `https://zedonk-csv-export.onrender.com/api/orders?ids=${idsParam}`;
      
      setDownloadUrl(url);
      setLoading(false);
      
    } catch (err) {
      console.error('Export error:', err);
      setLoading(false);
    }
  };
  
  const copyToClipboard = () => {
    if (downloadUrl) {
      navigator.clipboard.writeText(downloadUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <AdminAction
      primaryAction={
        downloadUrl ? (
          <Button 
            onPress={copyToClipboard} 
            variant="primary"
          >
            {copied ? 'Copied!' : 'Copy Download Link'}
          </Button>
        ) : (
          <Button 
            onPress={handleExportBulk} 
            variant="primary"
            disabled={loading || selectedCount === 0}
          >
            {loading ? 'Processing...' : `Generate Link for ${selectedCount} Orders`}
          </Button>
        )
      }
      secondaryAction={
        <Button onPress={() => close()} variant="plain">
          {downloadUrl ? 'Close' : 'Cancel'}
        </Button>
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Export to Zedonk CSV
        </Text>
        
        {selectedCount > 0 && !downloadUrl && (
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
        
        {loading && (
          <Banner tone="info">
            <Text>링크 생성 중...</Text>
          </Banner>
        )}
        
        {downloadUrl && (
          <BlockStack gap>
            <Banner tone="success">
              <Text>링크가 생성되었습니다! 복사 버튼을 클릭하고 새 창에서 열어주세요.</Text>
            </Banner>
            <Text variant="bodySm" as="p" tone="subdued">
              {downloadUrl}
            </Text>
          </BlockStack>
        )}
      </BlockStack>
    </AdminAction>
  );
}