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
  const [downloadReady, setDownloadReady] = React.useState(false);
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
      const downloadUrl = `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
      
      // 새 창에서 열기
      window.open(downloadUrl, '_blank');
      
      setLoading(false);
      setDownloadReady(true);
      
      setTimeout(() => {
        close();
      }, 2000);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`다운로드 실패: ${err.message}`);
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
      
      const downloadUrl = `https://zedonk-csv-export.onrender.com/api/orders?ids=${idsParam}`;
      
      // 새 창에서 열기
      window.open(downloadUrl, '_blank');
      
      setLoading(false);
      setDownloadReady(true);
      
      setTimeout(() => {
        close();
      }, 2000);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`다운로드 실패: ${err.message}`);
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

  return (
    <AdminAction
      primaryAction={
        !downloadReady ? (
          <Button 
            onPress={handleExport} 
            variant="primary"
            disabled={loading || selectedCount === 0}
          >
            {loading ? 'Downloading...' : `Download CSV (${selectedCount} orders)`}
          </Button>
        ) : (
          <Button onPress={() => close()} variant="primary">
            Done
          </Button>
        )
      }
      secondaryAction={
        !loading && (
          <Button onPress={() => close()} variant="plain">
            Cancel
          </Button>
        )
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Export to Zedonk CSV
        </Text>
        
        {selectedCount > 1 && !loading && !downloadReady && !error && (
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
        
        {!error && !downloadReady && !loading && selectedCount === 1 && (
          <Text variant="bodyMd" as="p">
            주문 데이터를 CSV 파일로 다운로드합니다.
          </Text>
        )}
        
        {selectedCount === 0 && (
          <Banner tone="warning">
            <Text>주문을 선택해주세요.</Text>
          </Banner>
        )}
        
        {loading && (
          <Banner tone="info">
            <Text>
              {exportMode === 'bulk' && selectedCount > 1 
                ? `${selectedCount}개의 주문을 다운로드 중입니다...` 
                : '다운로드 중입니다...'}
            </Text>
          </Banner>
        )}
        
        {downloadReady && (
          <Banner tone="success">
            <Text>다운로드가 완료되었습니다!</Text>
          </Banner>
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