import { json } from "@remix-run/node";

// 환경변수에서 토큰 가져오기
const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN || "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";
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

export const loader = async ({ request, params }) => {
  try {
    const orderId = params.id;
    console.log("API called with order ID:", orderId);

    if (!orderId) {
      return json({ error: "Order ID is required" }, { status: 400 });
    }

    // REST API 엔드포인트
    const restUrl = `https://${SHOP_DOMAIN}/admin/api/2024-01/orders/${orderId}.json`;
    
    console.log("Calling REST API:", restUrl);
    
    const response = await fetch(restUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': PRIVATE_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error("REST API error:", response.status, response.statusText);
      const errorText = await response.text();
      console.error("Error details:", errorText);
      return json({ error: "Failed to fetch order", status: response.status }, { status: response.status });
    }

    const data = await response.json();
    const order = data.order;
    
    if (!order) {
      return json({ error: "Order not found" }, { status: 404 });
    }

    console.log("Order data retrieved:", {
      orderName: order.name,
      customerEmail: order.email,
      customerName: order.customer?.first_name + ' ' + order.customer?.last_name,
      shippingName: order.shipping_address?.name,
      billingName: order.billing_address?.name,
      itemCount: order.line_items?.length
    });

    // CSV 생성
    const csvRows = [];
    
    // Zedonk 형식 헤더
    csvRows.push([
      "Order Reference",
      "Customer Name", 
      "Account Code",
      "Style",
      "Fabric",
      "Colour",
      "Size",
      "Barcode",
      "Sales Order Quantity"
    ]);

    // 고객 이름 추출 (우선순위)
    const getCustomerName = () => {
      // 1. Customer 객체에서 이름 (Basic Plan에서 접근 가능한 경우)
      if (order.customer?.first_name || order.customer?.last_name) {
        return `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim();
      }
      
      // 2. Shipping Address 이름
      if (order.shipping_address?.name) {
        return order.shipping_address.name;
      }
      if (order.shipping_address?.first_name || order.shipping_address?.last_name) {
        return `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim();
      }
      
      // 3. Billing Address 이름
      if (order.billing_address?.name) {
        return order.billing_address.name;
      }
      if (order.billing_address?.first_name || order.billing_address?.last_name) {
        return `${order.billing_address.first_name || ''} ${order.billing_address.last_name || ''}`.trim();
      }
      
      // 4. 이메일에서 추출
      if (order.email) {
        const emailName = order.email.split('@')[0];
        return emailName.replace(/[._]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      // 5. Contact email에서 추출
      if (order.contact_email) {
        const emailName = order.contact_email.split('@')[0];
        return emailName.replace(/[._]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      
      return ''; // 고객 정보가 없으면 빈 문자열
    };

    const customerName = getCustomerName();
    console.log("Customer name resolved:", customerName);

    // 주문 라인 아이템 처리
    order.line_items.forEach((item, index) => {
      // 옵션에서 Size와 Colour 추출
      let size = '';
      let colour = '';
      
      // Variant properties에서 옵션 확인
      if (item.variant_title) {
        // variant_title은 보통 "Size / Color" 형식
        const options = item.variant_title.split(' / ');
        if (options.length >= 1) size = options[0];
        if (options.length >= 2) colour = options[1];
      }
      
      // Properties에서 추가 정보 확인
      if (item.properties && Array.isArray(item.properties)) {
        item.properties.forEach(prop => {
          if (prop.name.toLowerCase().includes('size')) {
            size = prop.value;
          } else if (prop.name.toLowerCase().includes('color') || prop.name.toLowerCase().includes('colour')) {
            colour = prop.value;
          }
        });
      }

      // Style: SKU 우선
      const style = item.sku || item.title || '';
      
      // Fabric: vendor 또는 product type에서
      const fabric = item.vendor || '';

      console.log(`Line item ${index + 1}:`, {
        title: item.title,
        sku: item.sku,
        variant_title: item.variant_title,
        quantity: item.quantity
      });

      csvRows.push([
        order.name || '',                      // Order Reference (e.g., #1001)
        customerName,                          // Customer Name (빈 값일 수 있음)
        '',                                    // Account Code (비워둠)
        style,                                 // Style (SKU or title)
        fabric,                                // Fabric (vendor)
        colour || '',                          // Colour
        size || '',                            // Size
        '',                                    // Barcode (REST API에서는 별도 호출 필요)
        item.quantity.toString()               // Sales Order Quantity
      ]);
    });

    // CSV 문자열로 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    // BOM 추가 (Excel에서 UTF-8 인식)
    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    console.log("CSV generated successfully");

    // CSV 파일로 응답
    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zedonk_order_${order.name.replace('#', '')}_${new Date().toISOString().split('T')[0]}.csv"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error("API Error:", error);
    console.error("Error stack:", error.stack);
    return json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
};