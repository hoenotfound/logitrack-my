import { useState, useEffect } from "react";

interface UseOrdersOptions {
  status?: string;
}

export function useOrders({ status }: UseOrdersOptions = {}) {
  const [orders, setOrders] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const url = status
      ? `/api/orders?status=${encodeURIComponent(status)}`
      : "/api/orders";

    setIsLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err);
        setIsLoading(false);
      });
  }, [status]);

  return { orders, isLoading, error };
}
