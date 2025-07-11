import React from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Banner,
  InlineStack,
  Badge,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [downloadUrl, setDownloadUrl] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [exportMode, setExportMode] = React.useState('single'); // 'single' or 'bulk'
  
  // 선택된 주문 수 확인
  const selectedCount = data.selected?.length || 0;
  
  const handleExportSingle = () => {
    const orderId = data.selected?.[0]?.id;
    
    if (!orderId) {
      setError('주문을 선택해주세요.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const numericId = orderId.split('/').pop();
      const url = `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
      
      setDownloadUrl(url);
      setLoading(false);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`URL 생성 실패: ${err.message}`);
      setLoading(false);
    }
  };
  
  const handleExportBulk = () => {
    if (!data.selected || data.selected.length === 0) {
      setError('주문을 선택해주세요.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // 모든 선택된 주문의 ID 추출
      const orderIds = data.selected.map(order => order.id.split('/').pop());
      const idsParam = orderIds.join(',');
      
      const url = `https://zedonk-csv-export.onrender.com/api/orders?ids=${idsParam}`;
      
      setDownloadUrl(url);
      setLoading(false);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`URL 생성 실패: ${err.message}`);
      setLoading(false);
    }
  };
  
  const handleExport = () => {
    if (exportMode === 'single') {
      handleExportSingle();
    } else {
      handleExportBulk();
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
            onPress={handleExport} 
            variant="primary"
            disabled={loading || selectedCount === 0}
          >
            {loading ? 'Processing...' : `Generate Link (${selectedCount} orders)`}
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
        
        {selectedCount > 1 && !loading && !downloadUrl && !error && (
          <BlockStack gap>
            <InlineStack gap>
              <Badge tone="info">{selectedCount} orders selected</Badge>
            </InlineStack>
            
            <BlockStack gap="tight">
              <Button
                variant={exportMode === 'single' ? 'primary' : 'plain'}
                onPress={() => setExportMode('single')}
                size="slim"
              >
                Export first order only
              </Button>
              <Button
                variant={exportMode === 'bulk' ? 'primary' : 'plain'}
                onPress={() => setExportMode('bulk')}
                size="slim"
              >
                Export all {selectedCount} orders in one file
              </Button>
            </BlockStack>
          </BlockStack>
        )}
        
        {!error && !downloadUrl && !loading && selectedCount === 1 && (
          <Text variant="bodyMd" as="p">
            다운로드 링크를 생성합니다.
          </Text>
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
        
        {error && (
          <Banner tone="critical">
            <Text>{error}</Text>
          </Banner>
        )}
      </BlockStack>
    </AdminAction>
  );
}